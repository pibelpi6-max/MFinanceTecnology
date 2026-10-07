"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTreeByStructure } from "@/lib/dimensions/queries";

interface ActionResult {
  success?: true;
  id?: string;
  error?: string;
}

async function requireAdmin() {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  if (tenant.role !== "admin") {
    throw new Error("Apenas administradores podem alterar parâmetros do sistema.");
  }
  return tenant;
}

function afterMutation() {
  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin", "layout");
}

export async function createDimensionStructure(input: {
  dimensionTypeId: string;
  name: string;
}): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const name = input.name.trim();
    if (!name) return { error: "Informe um nome." };

    const supabase = await createClient();
    const { data: last } = await supabase
      .from("dimension_structures")
      .select("sort_order")
      .eq("dimension_type_id", input.dimensionTypeId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Nasce inativa: a usuária decide quando "virar a chave" pra essa
    // estrutura passar a alimentar Matriz/Pacotes/Realizado (só pode
    // haver 1 ativa por dimensão — ver setDimensionStructureActive).
    const { data: created, error } = await supabase
      .from("dimension_structures")
      .insert({
        tenant_id: tenant.tenantId,
        dimension_type_id: input.dimensionTypeId,
        name,
        is_active: false,
        sort_order: (last?.sort_order ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { error: "Já existe uma estrutura com esse nome nesta dimensão." };
      return { error: error.message };
    }

    afterMutation();
    return { success: true, id: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function renameDimensionStructure(input: { id: string; name: string }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const name = input.name.trim();
    if (!name) return { error: "Informe um nome." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("dimension_structures")
      .update({ name })
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) {
      if (error.code === "23505") return { error: "Já existe uma estrutura com esse nome nesta dimensão." };
      return { error: error.message };
    }

    afterMutation();
    return { success: true, id: input.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function setDimensionStructureActive(input: {
  id: string;
  dimensionTypeId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const supabase = await createClient();

    // Desde a migration 0014, "Ativa" não é mais exclusiva por dimensão
    // (o índice único parcial da 0012 foi removido) — várias estruturas
    // da mesma dimensão podem ficar "Ativa" (= disponível pra uso) ao
    // mesmo tempo. Quem decide qual entra em cada cenário de fato é o
    // Orçamento, via seu Conjunto de Estruturas — ver
    // claude/decisoes-arquitetura.md, "Orçamento (entidade nova,
    // versões/revisões)".
    const { error } = await supabase
      .from("dimension_structures")
      .update({ is_active: input.isActive })
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) return { error: error.message };

    afterMutation();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function duplicateDimensionStructure(input: {
  id: string;
  newName: string;
  year: number;
}): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const name = input.newName.trim();
    if (!name) return { error: "Informe um nome." };

    const supabase = await createClient();

    const { data: source, error: sourceError } = await supabase
      .from("dimension_structures")
      .select("id, dimension_type_id")
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId)
      .maybeSingle();
    if (sourceError) return { error: sourceError.message };
    if (!source) return { error: "Estrutura não encontrada." };

    const { data: last } = await supabase
      .from("dimension_structures")
      .select("sort_order")
      .eq("dimension_type_id", source.dimension_type_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: newStructure, error: insertStructureError } = await supabase
      .from("dimension_structures")
      .insert({
        tenant_id: tenant.tenantId,
        dimension_type_id: source.dimension_type_id,
        name,
        is_active: false,
        sort_order: (last?.sort_order ?? 0) + 1,
      })
      .select("id")
      .single();
    if (insertStructureError) {
      if (insertStructureError.code === "23505") {
        return { error: "Já existe uma estrutura com esse nome nesta dimensão." };
      }
      return { error: insertStructureError.message };
    }

    // Clona o retrato ATUAL da árvore de origem (itens vigentes no ano
    // corrente) — não o histórico de versões. A árvore já vem ordenada
    // por nível (getDimensionTreeByStructure), então processar nessa
    // ordem garante que o pai sempre já foi clonado quando o filho é
    // criado, permitindo remapear parent_node_id pro novo id.
    const nodes = await getDimensionTreeByStructure(tenant.tenantId, source.id, input.year);
    const sorted = [...nodes].sort((a, b) => a.level - b.level);
    const idMap = new Map<string, string>();

    for (const node of sorted) {
      const newParentId = node.parentNodeId ? idMap.get(node.parentNodeId) ?? null : null;

      const { data: newNode, error: nodeError } = await supabase
        .from("dimension_nodes")
        .insert({
          tenant_id: tenant.tenantId,
          dimension_type_id: source.dimension_type_id,
          structure_id: newStructure.id,
          code: node.code,
        })
        .select("id")
        .single();
      if (nodeError) return { error: `Erro ao duplicar o item "${node.name}": ${nodeError.message}` };

      const { error: versionError } = await supabase.from("dimension_node_versions").insert({
        dimension_node_id: newNode.id,
        parent_node_id: newParentId,
        name: node.name,
        level: node.level,
        valid_from_year: input.year,
        valid_until_year: null,
      });
      if (versionError) return { error: `Erro ao duplicar o item "${node.name}": ${versionError.message}` };

      idMap.set(node.id, newNode.id);
    }

    afterMutation();
    return { success: true, id: newStructure.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function deleteDimensionStructure(input: { id: string }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const supabase = await createClient();

    const { count, error: countError } = await supabase
      .from("dimension_nodes")
      .select("id", { count: "exact", head: true })
      .eq("structure_id", input.id);
    if (countError) return { error: countError.message };
    if ((count ?? 0) > 0) {
      return { error: "Esta estrutura tem itens cadastrados. Exclua os itens antes de remover a estrutura." };
    }

    // Desde a migration 0014: uma Estrutura referenciada por algum
    // Conjunto de Estruturas não pode ser excluída (a fk de
    // conjunto_estrutura_items.structure_id é ON DELETE RESTRICT) — essa
    // checagem só existe pra devolver uma mensagem amigável em vez do
    // erro cru do Postgres.
    const { count: usageCount, error: usageError } = await supabase
      .from("conjunto_estrutura_items")
      .select("id", { count: "exact", head: true })
      .eq("structure_id", input.id);
    if (usageError) return { error: usageError.message };
    if ((usageCount ?? 0) > 0) {
      return { error: "Esta estrutura está em uso por um ou mais Conjuntos de Estrutura. Remova-a dos conjuntos antes de excluir." };
    }

    const { error } = await supabase
      .from("dimension_structures")
      .delete()
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) return { error: error.message };

    afterMutation();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}
