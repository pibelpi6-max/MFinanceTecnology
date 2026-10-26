"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import {
  ORCAMENTO_LABEL_MAX,
  ORCAMENTO_STATUSES,
  ORCAMENTO_TIPOS,
  type OrcamentoStatus,
  type OrcamentoTipo,
} from "@/lib/orcamentos/types";

interface ActionResult {
  success?: true;
  id?: string;
  error?: string;
}

interface OrcamentoInput {
  year: number;
  label: string;
  description: string;
  tipo: OrcamentoTipo;
  status: OrcamentoStatus;
  oficial: boolean;
  conjuntoEstruturaId: string | null;
}

async function requireAdmin() {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  if (tenant.role !== "admin") {
    throw new Error("Apenas administradores podem alterar orçamentos.");
  }
  return tenant;
}

function afterMutation() {
  revalidatePath("/admin/orcamentos");
  revalidatePath("/admin", "layout");
}

function validate(input: OrcamentoInput): string | null {
  const label = input.label.trim();
  if (!label) return "Informe um nome para o orçamento.";
  if (label.length > ORCAMENTO_LABEL_MAX) return `O nome pode ter no máximo ${ORCAMENTO_LABEL_MAX} caracteres.`;
  if (!ORCAMENTO_TIPOS.includes(input.tipo)) return "Tipo inválido.";
  if (!ORCAMENTO_STATUSES.includes(input.status)) return "Status inválido.";
  if (!Number.isInteger(input.year)) return "Ano inválido.";
  return null;
}

/** Garante no máximo um oficial por ano: ao marcar, os outros do ano deixam de ser. */
async function applyOficial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  id: string,
  year: number,
  oficial: boolean
): Promise<string | null> {
  if (oficial) {
    const { error: clearError } = await supabase
      .from("orcamentos")
      .update({ oficial: false })
      .eq("tenant_id", tenantId)
      .eq("year", year)
      .eq("oficial", true)
      .neq("id", id);
    if (clearError) return clearError.message;
  }
  const { error } = await supabase.from("orcamentos").update({ oficial }).eq("id", id).eq("tenant_id", tenantId);
  return error ? error.message : null;
}

const DUPLICATE_LABEL_ERROR = "Já existe um orçamento com esse ano e nome.";

export async function createOrcamento(input: OrcamentoInput): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const invalid = validate(input);
    if (invalid) return { error: invalid };

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("orcamentos")
      .insert({
        tenant_id: tenant.tenantId,
        year: input.year,
        label: input.label.trim(),
        description: input.description.trim() || null,
        tipo: input.tipo,
        status: input.status,
        conjunto_estrutura_id: input.conjuntoEstruturaId,
      })
      .select("id")
      .single();
    if (error) return { error: error.code === "23505" ? DUPLICATE_LABEL_ERROR : error.message };

    if (input.oficial) {
      const oficialError = await applyOficial(supabase, tenant.tenantId, created.id, input.year, true);
      if (oficialError) return { error: oficialError };
    }

    afterMutation();
    return { success: true, id: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function updateOrcamento(input: OrcamentoInput & { id: string }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const invalid = validate(input);
    if (invalid) return { error: invalid };

    const supabase = await createClient();
    const { error } = await supabase
      .from("orcamentos")
      .update({
        year: input.year,
        label: input.label.trim(),
        description: input.description.trim() || null,
        tipo: input.tipo,
        status: input.status,
        conjunto_estrutura_id: input.conjuntoEstruturaId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) {
      if (error.code === "23505") return { error: DUPLICATE_LABEL_ERROR };
      return { error: error.message };
    }

    const oficialError = await applyOficial(supabase, tenant.tenantId, input.id, input.year, input.oficial);
    if (oficialError) return { error: oficialError };

    afterMutation();
    return { success: true, id: input.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

/**
 * Arrastar e soltar na linha do tempo: coloca o orçamento `id` no ano `year`
 * na posição definida por `orderedIds` (a lista completa de ids do ano de
 * destino, já com `id` incluído) e renumera a ordem.
 */
export async function reorderOrcamentos(input: { id: string; year: number; orderedIds: string[] }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    if (!Number.isInteger(input.year)) return { error: "Ano inválido." };
    if (!input.orderedIds.includes(input.id)) return { error: "Ordem inválida." };
    const supabase = await createClient();

    const { data: orc, error: fetchError } = await supabase
      .from("orcamentos")
      .select("id, year, label, oficial")
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId)
      .maybeSingle();
    if (fetchError) return { error: fetchError.message };
    if (!orc) return { error: "Orçamento não encontrado." };

    if (orc.year !== input.year) {
      if (orc.oficial) {
        const { count, error: officialError } = await supabase
          .from("orcamentos")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.tenantId)
          .eq("year", input.year)
          .eq("oficial", true);
        if (officialError) return { error: officialError.message };
        if ((count ?? 0) > 0) {
          return { error: `Já existe um orçamento oficial em ${input.year}. Remova a estrela dele antes de mover este.` };
        }
      }
      const { error } = await supabase
        .from("orcamentos")
        .update({ year: input.year, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("tenant_id", tenant.tenantId);
      if (error) return { error: error.code === "23505" ? DUPLICATE_LABEL_ERROR : error.message };
    }

    const results = await Promise.all(
      input.orderedIds.map((id, index) =>
        supabase.from("orcamentos").update({ sort_order: index }).eq("id", id).eq("tenant_id", tenant.tenantId)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return { error: failed.error.message };

    afterMutation();
    return { success: true, id: input.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

/** Marca (ou desmarca) o orçamento oficial do ano — no máximo um por ano. */
export async function setOrcamentoOficial(input: { id: string; oficial: boolean }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const supabase = await createClient();

    const { data: orc, error: fetchError } = await supabase
      .from("orcamentos")
      .select("id, year")
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId)
      .maybeSingle();
    if (fetchError) return { error: fetchError.message };
    if (!orc) return { error: "Orçamento não encontrado." };

    if (input.oficial) {
      const { error: clearError } = await supabase
        .from("orcamentos")
        .update({ oficial: false })
        .eq("tenant_id", tenant.tenantId)
        .eq("year", orc.year)
        .eq("oficial", true);
      if (clearError) return { error: clearError.message };
    }

    const { error } = await supabase
      .from("orcamentos")
      .update({ oficial: input.oficial, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) return { error: error.message };

    afterMutation();
    return { success: true, id: input.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

/**
 * Duplica um orçamento: mesmo ano/tipo/Conjunto, lançamentos da Matriz e
 * Pacotes copiados (pacotes voltam a Rascunho). A cópia nasce como
 * Rascunho e nunca como oficial.
 */
export async function duplicateOrcamento(input: { id: string }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const supabase = await createClient();

    const { data: source, error: sourceError } = await supabase
      .from("orcamentos")
      .select("*")
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId)
      .maybeSingle();
    if (sourceError) return { error: sourceError.message };
    if (!source) return { error: "Orçamento não encontrado." };

    const { data: siblings, error: siblingsError } = await supabase
      .from("orcamentos")
      .select("label")
      .eq("tenant_id", tenant.tenantId)
      .eq("year", source.year);
    if (siblingsError) return { error: siblingsError.message };
    const taken = new Set((siblings ?? []).map((s) => s.label));

    const suffix = " (cópia)";
    const base = source.label.slice(0, ORCAMENTO_LABEL_MAX - suffix.length - 3).trimEnd();
    let label = `${base}${suffix}`;
    for (let n = 2; taken.has(label); n++) label = `${base} (cópia ${n})`;

    const { data: created, error: createError } = await supabase
      .from("orcamentos")
      .insert({
        tenant_id: tenant.tenantId,
        year: source.year,
        label,
        description: source.description,
        tipo: source.tipo,
        status: "rascunho",
        oficial: false,
        conjunto_estrutura_id: source.conjunto_estrutura_id,
      })
      .select("id")
      .single();
    if (createError) return { error: createError.message };
    const newId = created.id as string;

    const rollback = async (message: string): Promise<ActionResult> => {
      await supabase.from("matrix_budget_entries").delete().eq("orcamento_id", newId);
      await supabase.from("budget_packages").delete().eq("orcamento_id", newId);
      await supabase.from("orcamentos").delete().eq("id", newId);
      return { error: message };
    };

    // Pacotes: copia e guarda o mapa id antigo -> novo para remapear os lançamentos.
    const { data: packages, error: packagesError } = await supabase
      .from("budget_packages")
      .select("*")
      .eq("orcamento_id", input.id);
    if (packagesError) return rollback(packagesError.message);

    const packageMap = new Map<string, string>();
    for (const pkg of packages ?? []) {
      const { id: oldId, created_at: _c, updated_at: _u, ...rest } = pkg;
      void _c;
      void _u;
      const { data: newPkg, error } = await supabase
        .from("budget_packages")
        .insert({ ...rest, orcamento_id: newId, status: "rascunho" })
        .select("id")
        .single();
      if (error) return rollback(error.message);
      packageMap.set(oldId, newPkg.id);
    }

    // Lançamentos da Matriz, em lotes.
    const { data: entries, error: entriesError } = await supabase
      .from("matrix_budget_entries")
      .select("*")
      .eq("orcamento_id", input.id);
    if (entriesError) return rollback(entriesError.message);

    const rows = (entries ?? []).map((entry) => {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = entry;
      void _id;
      void _c;
      void _u;
      return {
        ...rest,
        orcamento_id: newId,
        package_id: entry.package_id ? (packageMap.get(entry.package_id) ?? null) : null,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("matrix_budget_entries").insert(rows.slice(i, i + 500));
      if (error) return rollback(error.message);
    }

    afterMutation();
    return { success: true, id: newId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function deleteOrcamento(input: { id: string }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const supabase = await createClient();

    const [{ count: matrixCount, error: matrixError }, { count: packageCount, error: packageError }] =
      await Promise.all([
        supabase.from("matrix_budget_entries").select("id", { count: "exact", head: true }).eq("orcamento_id", input.id),
        supabase.from("budget_packages").select("id", { count: "exact", head: true }).eq("orcamento_id", input.id),
      ]);
    if (matrixError) return { error: matrixError.message };
    if (packageError) return { error: packageError.message };
    if ((matrixCount ?? 0) > 0 || (packageCount ?? 0) > 0) {
      return { error: "Este orçamento já tem lançamentos ou pacotes associados. Não é possível excluí-lo." };
    }

    const { error } = await supabase
      .from("orcamentos")
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
