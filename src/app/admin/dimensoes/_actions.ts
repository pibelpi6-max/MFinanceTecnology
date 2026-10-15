"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { BATCH_REF_PREFIX } from "@/lib/import/types";

interface ActionResult {
  success?: true;
  error?: string;
}

async function requireTenant() {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  return tenant;
}

function computeLevel(parent: { level: number } | null): number {
  return parent ? parent.level + 1 : 1;
}

/**
 * Resolve em qual Estrutura (ver dimension_structures, migration 0012) um
 * novo item deve entrar. Se o chamador já sabe (telas que navegam por
 * estrutura, como o painel "Estruturas" em Parâmetros), usa esse id
 * direto; senão cai pra Estrutura ATIVA do tipo — mantém os chamadores
 * antigos (assistente de importação em /admin/dimensoes/[tipo]/importar)
 * funcionando sem precisar saber de "Estruturas".
 */
async function resolveStructureId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  dimensionTypeId: string,
  structureId: string | null | undefined
): Promise<string | null> {
  if (structureId) return structureId;
  const { data } = await supabase
    .from("dimension_structures")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("dimension_type_id", dimensionTypeId)
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Cada estrutura admite um único item raiz (nível 1) — regra de produto já
 * aplicada na tela (o botão "+ item" raiz some depois do primeiro). Aqui é
 * a garantia no servidor, para importação e chamadas diretas.
 */
async function countRootNodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  structureId: string,
  year: number
): Promise<number> {
  const { data: nodes } = await supabase.from("dimension_nodes").select("id").eq("structure_id", structureId);
  const ids = (nodes ?? []).map((n) => n.id);
  if (ids.length === 0) return 0;
  const { count } = await supabase
    .from("dimension_node_versions")
    .select("id", { count: "exact", head: true })
    .in("dimension_node_id", ids)
    .is("parent_node_id", null)
    .lte("valid_from_year", year)
    .or(`valid_until_year.is.null,valid_until_year.gte.${year}`);
  return count ?? 0;
}

const SINGLE_ROOT_ERROR =
  "Esta estrutura já tem um item de nível 1. Informe um Item Superior para colocar este item dentro dele.";

export async function createDimensionNode(input: {
  dimensionTypeId: string;
  structureId?: string;
  code: string;
  name: string;
  parentNodeId: string | null;
  year: number;
}): Promise<ActionResult> {
  try {
    const { tenantId } = await requireTenant();
    const supabase = await createClient();

    const structureId = await resolveStructureId(supabase, tenantId, input.dimensionTypeId, input.structureId);
    if (!structureId) {
      return { error: "Esta dimensão não tem uma estrutura ativa. Ative uma estrutura em Parâmetros antes de adicionar itens." };
    }

    if (!input.parentNodeId && (await countRootNodes(supabase, structureId, input.year)) >= 1) {
      return { error: SINGLE_ROOT_ERROR };
    }

    let level = 1;
    if (input.parentNodeId) {
      const { data: parentVersion } = await supabase
        .from("dimension_node_versions")
        .select("level")
        .eq("dimension_node_id", input.parentNodeId)
        .lte("valid_from_year", input.year)
        .or(`valid_until_year.is.null,valid_until_year.gte.${input.year}`)
        .maybeSingle();
      level = computeLevel(parentVersion);
    }
    if (level > 10) return { error: "Profundidade máxima de 10 níveis atingida." };

    const { data: node, error: nodeError } = await supabase
      .from("dimension_nodes")
      .insert({
        tenant_id: tenantId,
        dimension_type_id: input.dimensionTypeId,
        structure_id: structureId,
        code: input.code,
      })
      .select("id")
      .single();
    if (nodeError) return { error: nodeError.message };

    const { error: versionError } = await supabase
      .from("dimension_node_versions")
      .insert({
        dimension_node_id: node.id,
        parent_node_id: input.parentNodeId,
        name: input.name,
        level,
        valid_from_year: input.year,
        valid_until_year: null,
      });
    if (versionError) return { error: versionError.message };

    revalidatePath("/admin/dimensoes");
    revalidatePath("/admin/configuracoes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function updateDimensionNode(input: {
  nodeId: string;
  versionId: string;
  currentValidFromYear: number;
  name: string;
  code?: string;
  parentNodeId: string | null;
  year: number;
}): Promise<ActionResult> {
  try {
    await requireTenant();
    const supabase = await createClient();

    let level = 1;
    if (input.parentNodeId) {
      const { data: parentVersion } = await supabase
        .from("dimension_node_versions")
        .select("level")
        .eq("dimension_node_id", input.parentNodeId)
        .lte("valid_from_year", input.year)
        .or(`valid_until_year.is.null,valid_until_year.gte.${input.year}`)
        .maybeSingle();
      level = computeLevel(parentVersion);
    }
    if (level > 10) return { error: "Profundidade máxima de 10 níveis atingida." };

    // Código vive em dimension_nodes (não é versionado por ano, ao contrário
    // de nome/pai) — atualiza à parte, só quando veio preenchido e mudou.
    if (input.code !== undefined) {
      const { error: codeError } = await supabase
        .from("dimension_nodes")
        .update({ code: input.code })
        .eq("id", input.nodeId);
      if (codeError) {
        return {
          error:
            codeError.code === "23505"
              ? `Já existe um item com o código "${input.code}".`
              : codeError.message,
        };
      }
    }

    if (input.currentValidFromYear === input.year) {
      const { error } = await supabase
        .from("dimension_node_versions")
        .update({ name: input.name, parent_node_id: input.parentNodeId, level })
        .eq("id", input.versionId);
      if (error) return { error: error.message };
    } else {
      const { error: closeError } = await supabase
        .from("dimension_node_versions")
        .update({ valid_until_year: input.year - 1 })
        .eq("id", input.versionId);
      if (closeError) return { error: closeError.message };

      const { error: insertError } = await supabase
        .from("dimension_node_versions")
        .insert({
          dimension_node_id: input.nodeId,
          parent_node_id: input.parentNodeId,
          name: input.name,
          level,
          valid_from_year: input.year,
          valid_until_year: null,
        });
      if (insertError) return { error: insertError.message };
    }

    revalidatePath("/admin/dimensoes");
    revalidatePath("/admin/configuracoes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function importDimensionNodes(input: {
  dimensionTypeId: string;
  /** Estrutura de destino. Quando o chamador já sabe qual (modal de
   * importação por Estrutura em Parâmetros — ver ImportStructureModal),
   * passa aqui; senão cai pra Estrutura ATIVA do tipo, como antes. */
  structureId?: string;
  year: number;
  rows: { values: Record<string, string> }[];
}): Promise<{ successCount: number; errorCount: number; errors: { rowIndex: number; message: string }[] }> {
  const { tenantId } = await requireTenant();
  const supabase = await createClient();

  const structureId = await resolveStructureId(supabase, tenantId, input.dimensionTypeId, input.structureId);
  if (!structureId) {
    return {
      successCount: 0,
      errorCount: input.rows.length,
      errors: [{ rowIndex: 0, message: "Esta dimensão não tem uma estrutura ativa. Ative uma estrutura em Parâmetros antes de importar." }],
    };
  }

  const errors: { rowIndex: number; message: string }[] = [];
  let successCount = 0;

  const norm = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  // Itens criados nesta importação, para filhos que apontam (por código ou
  // nome) para um pai que está na mesma planilha: chave normalizada → id/nível.
  const createdByCode = new Map<string, { id: string; level: number }>();
  const createdByName = new Map<string, { id: string; level: number }>();

  // Hierarquia num arquivo só: processa em passadas — a cada passada cria
  // quem não depende de ninguém ou cujo pai (existente ou da planilha) já foi
  // criado; repete até não haver progresso. O que sobrar tem pai inexistente,
  // com erro ou ciclo.
  let rootCount = await countRootNodes(supabase, structureId, input.year);

  let pending = input.rows.map((r, rowIndex) => ({ rowIndex, values: r.values }));

  while (pending.length > 0) {
    const stillPending: typeof pending = [];
    let progressed = false;

    for (const { rowIndex, values } of pending) {
      const code = (values.codigo ?? "").trim();
      const name = (values.nome ?? "").trim();
      const rawParent = values.item_superior || null;

      if (!code || !name) {
        errors.push({ rowIndex, message: "Código e nome são obrigatórios." });
        progressed = true;
        continue;
      }

      let parentNodeId: string | null = null;
      let level = 1;
      if (rawParent && rawParent.startsWith(BATCH_REF_PREFIX)) {
        const ref = norm(rawParent.slice(BATCH_REF_PREFIX.length));
        const parent = createdByCode.get(ref) ?? createdByName.get(ref);
        if (!parent) {
          stillPending.push({ rowIndex, values });
          continue;
        }
        parentNodeId = parent.id;
        level = parent.level + 1;
      } else if (rawParent) {
        parentNodeId = rawParent;
        const { data: parentVersion } = await supabase
          .from("dimension_node_versions")
          .select("level")
          .eq("dimension_node_id", parentNodeId)
          .lte("valid_from_year", input.year)
          .or(`valid_until_year.is.null,valid_until_year.gte.${input.year}`)
          .maybeSingle();
        level = computeLevel(parentVersion);
      }

      progressed = true;
      if (!parentNodeId && rootCount >= 1) {
        errors.push({ rowIndex, message: SINGLE_ROOT_ERROR });
        continue;
      }
      if (level > 10) {
        errors.push({ rowIndex, message: "Profundidade máxima de 10 níveis atingida." });
        continue;
      }

      const { data: node, error: nodeError } = await supabase
        .from("dimension_nodes")
        .insert({ tenant_id: tenantId, dimension_type_id: input.dimensionTypeId, structure_id: structureId, code })
        .select("id")
        .single();
      if (nodeError) {
        const message = nodeError.code === "23505" ? `Já existe um item com o código "${code}".` : nodeError.message;
        errors.push({ rowIndex, message });
        continue;
      }

      const { error: versionError } = await supabase.from("dimension_node_versions").insert({
        dimension_node_id: node.id,
        parent_node_id: parentNodeId,
        name,
        level,
        valid_from_year: input.year,
        valid_until_year: null,
      });
      if (versionError) {
        errors.push({ rowIndex, message: versionError.message });
        continue;
      }

      if (!parentNodeId) rootCount++;
      createdByCode.set(norm(code), { id: node.id, level });
      if (!createdByName.has(norm(name))) createdByName.set(norm(name), { id: node.id, level });
      successCount++;
    }

    if (!progressed) {
      for (const { rowIndex, values } of stillPending) {
        const ref = (values.item_superior ?? "").slice(BATCH_REF_PREFIX.length);
        errors.push({
          rowIndex,
          message: `Não foi criado porque o item superior "${ref}" não foi importado (veja o motivo na linha dele ou ajuste o Item Superior).`,
        });
      }
      break;
    }
    pending = stillPending;
  }

  errors.sort((a, b) => a.rowIndex - b.rowIndex);

  if (successCount > 0) {
    revalidatePath("/admin/dimensoes");
    revalidatePath("/admin/configuracoes");
  }
  return { successCount, errorCount: errors.length, errors };
}

export async function cancelDimensionNode(input: {
  versionId: string;
  year: number;
}): Promise<ActionResult> {
  try {
    await requireTenant();
    const supabase = await createClient();
    const { error } = await supabase
      .from("dimension_node_versions")
      .update({ valid_until_year: input.year - 1 })
      .eq("id", input.versionId);
    if (error) return { error: error.message };

    revalidatePath("/admin/dimensoes");
    revalidatePath("/admin/configuracoes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}
