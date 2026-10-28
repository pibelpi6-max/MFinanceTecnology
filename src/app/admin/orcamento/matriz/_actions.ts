"use server";

import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";

interface ActionResult {
  success?: true;
  error?: string;
}

export async function saveMatrixEntries(input: {
  year: number;
  month: number;
  entityNodeId: string;
  /**
   * Orçamento selecionado no seletor global — lançar valores exige um
   * Orçamento (ver migration 0015_religar_orcamento.sql); `null` é
   * rejeitado abaixo em vez de gravar mais lançamentos no bucket
   * legado (dado anterior à religação, mantido só para leitura).
   */
  orcamentoId: string | null;
  /** Pacote em edição (null = lançamentos sem pacote). */
  packageId?: string | null;
  /** { [dimensionTypeId]: dimensionNodeId } dos eixos extras selecionados (ver 0011_matriz_eixos_extras.sql). */
  extraDimensions?: Record<string, string>;
  entries: { accountNodeId: string; costCenterNodeId: string; amount: number }[];
}): Promise<ActionResult> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (input.entries.length === 0) return { success: true };
    if (!input.orcamentoId) {
      return { error: "Selecione um Orçamento (no topo da tela) antes de lançar valores." };
    }

    const supabase = await createClient();
    const extraDimensions = input.extraDimensions ?? {};
    const packageId = input.packageId ?? null;
    if (packageId) {
      const { data: pkg } = await supabase
        .from("budget_packages")
        .select("id, status, orcamento_id")
        .eq("id", packageId)
        .eq("tenant_id", tenant.tenantId)
        .maybeSingle();
      if (!pkg || pkg.orcamento_id !== input.orcamentoId) return { error: "Pacote inválido para este Orçamento." };
      if (pkg.status === "submetido" || pkg.status === "aprovado") {
        return { error: "Este pacote está bloqueado para edição (submetido ou aprovado)." };
      }
    }
    const rows = input.entries.map((e) => ({
      tenant_id: tenant.tenantId,
      year: input.year,
      month: input.month,
      entity_node_id: input.entityNodeId,
      cost_center_node_id: e.costCenterNodeId,
      account_node_id: e.accountNodeId,
      extra_dimensions: extraDimensions,
      amount: e.amount,
      created_by: tenant.userId,
      orcamento_id: input.orcamentoId,
      package_id: packageId,
    }));

    const { error } = await supabase
      .from("matrix_budget_entries")
      .upsert(rows, {
        onConflict:
          "tenant_id,year,month,cost_center_node_id,account_node_id,entity_node_id,extra_dimensions,orcamento_id,package_id",
      });
    if (error) return { error: error.message };

    revalidatePath("/admin/orcamento/matriz");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function importMatrixEntries(input: {
  /** Mesma regra de saveMatrixEntries: importar também exige um Orçamento selecionado. */
  orcamentoId: string | null;
  rows: { values: Record<string, string> }[];
}): Promise<{ successCount: number; errorCount: number; errors: { rowIndex: number; message: string }[] }> {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  if (!input.orcamentoId) {
    return {
      successCount: 0,
      errorCount: input.rows.length,
      errors: [{ rowIndex: 0, message: "Selecione um Orçamento (no topo da tela) antes de importar." }],
    };
  }
  const supabase = await createClient();

  const errors: { rowIndex: number; message: string }[] = [];
  let successCount = 0;

  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex++) {
    const v = input.rows[rowIndex].values;
    const year = Number(v.ano);
    const month = Number(v.mes);
    const amount = Number(v.valor);

    if (!v[DIMENSION_CODES.ENTIDADE] || !v.centro_custo || !v.conta || !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(amount)) {
      errors.push({ rowIndex, message: "Linha incompleta ou com valores inválidos." });
      continue;
    }

    const { error } = await supabase.from("matrix_budget_entries").upsert(
      {
        tenant_id: tenant.tenantId,
        year,
        month,
        entity_node_id: v[DIMENSION_CODES.ENTIDADE],
        cost_center_node_id: v.centro_custo,
        account_node_id: v.conta,
        // A importação por planilha ainda não coleta valores de eixo
        // extra (ver 0011_matriz_eixos_extras.sql) — todo lançamento
        // importado cai no "sem eixo extra selecionado".
        extra_dimensions: {},
        amount,
        created_by: tenant.userId,
        orcamento_id: input.orcamentoId,
      },
      {
        onConflict:
          "tenant_id,year,month,cost_center_node_id,account_node_id,entity_node_id,extra_dimensions,orcamento_id,package_id",
      }
    );
    if (error) {
      errors.push({ rowIndex, message: error.message });
      continue;
    }
    successCount++;
  }

  if (successCount > 0) revalidatePath("/admin/orcamento/matriz");
  return { successCount, errorCount: errors.length, errors };
}
