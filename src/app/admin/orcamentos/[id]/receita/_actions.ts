"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { createDimensionType } from "@/app/admin/configuracoes/_actions";
import { createDimensionNode } from "@/app/admin/dimensoes/_actions";
import { applyPriceAdjust, applyVolumeGrowth, type RevenueLine } from "@/lib/receita/calc";

interface Result {
  success?: true;
  error?: string;
}

const CURRENCY_RE = /^[A-Z]{3}$/;

function refresh(orcamentoId: string) {
  revalidatePath(`/admin/orcamentos/${orcamentoId}/receita`);
}

async function assertOrcamento(tenantId: string, orcamentoId: string): Promise<{ year: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orcamentos")
    .select("year")
    .eq("id", orcamentoId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data ? { year: data.year } : null;
}

export async function saveRevenueEntries(input: {
  orcamentoId: string;
  entityNodeId: string | null;
  currencyByProduct: Record<string, string>;
  cells: { productId: string; month: number; volume: number; unitPrice: number }[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { error: "Orçamento não encontrado" };
    if (input.cells.length === 0) return { success: true };

    const rows = [];
    for (const c of input.cells) {
      const currency = input.currencyByProduct[c.productId] ?? "BRL";
      if (!CURRENCY_RE.test(currency)) return { error: "Moeda inválida" };
      if (c.month < 1 || c.month > 12) return { error: "Mês inválido" };
      if (!Number.isFinite(c.volume) || !Number.isFinite(c.unitPrice) || c.volume < 0 || c.unitPrice < 0) {
        return { error: "Volume e preço devem ser números positivos" };
      }
      rows.push({
        tenant_id: tenant.tenantId,
        orcamento_id: input.orcamentoId,
        year: orc.year,
        month: c.month,
        product_node_id: c.productId,
        entity_node_id: input.entityNodeId,
        extra_dimensions: {},
        currency,
        volume: c.volume,
        unit_price: c.unitPrice,
        updated_at: new Date().toISOString(),
      });
    }

    const supabase = await createClient();
    // Se a moeda do produto mudou, remove as linhas antigas (outra moeda) do mesmo produto/entidade.
    const productIds = Array.from(new Set(input.cells.map((c) => c.productId)));
    for (const pid of productIds) {
      const cur = input.currencyByProduct[pid] ?? "BRL";
      let del = supabase
        .from("revenue_entries")
        .delete()
        .eq("tenant_id", tenant.tenantId)
        .eq("orcamento_id", input.orcamentoId)
        .eq("year", orc.year)
        .eq("product_node_id", pid)
        .neq("currency", cur);
      del = input.entityNodeId ? del.eq("entity_node_id", input.entityNodeId) : del.is("entity_node_id", null);
      const { error: delErr } = await del;
      if (delErr) return { error: delErr.message };
    }
    const { error } = await supabase.from("revenue_entries").upsert(rows, {
      onConflict: "tenant_id,orcamento_id,year,month,product_node_id,entity_node_id,extra_dimensions,currency",
    });
    if (error) return { error: error.message };
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

export async function saveDeductions(input: {
  orcamentoId: string;
  productId: string;
  items: { code: string; label: string; pct: number }[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (!(await assertOrcamento(tenant.tenantId, input.orcamentoId))) return { error: "Orçamento não encontrado" };
    for (const i of input.items) {
      if (!i.label.trim()) return { error: "Informe o nome de cada dedução" };
      if (!Number.isFinite(i.pct) || i.pct < 0 || i.pct > 100) return { error: "Percentual deve estar entre 0 e 100" };
    }
    const supabase = await createClient();
    const { error: delErr } = await supabase
      .from("revenue_deductions")
      .delete()
      .eq("tenant_id", tenant.tenantId)
      .eq("orcamento_id", input.orcamentoId)
      .eq("product_node_id", input.productId);
    if (delErr) return { error: delErr.message };
    if (input.items.length > 0) {
      const { error } = await supabase.from("revenue_deductions").insert(
        input.items.map((i, idx) => ({
          tenant_id: tenant.tenantId,
          orcamento_id: input.orcamentoId,
          product_node_id: input.productId,
          code: `${idx}_${i.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}`.slice(0, 60),
          label: i.label.trim(),
          pct: i.pct,
          sort_order: idx,
        }))
      );
      if (error) return { error: error.message };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

export async function saveCurrencyRates(input: {
  orcamentoId: string;
  currency: string;
  /** 12 taxas (jan..dez); 0/vazio = não informada. */
  rates: number[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { error: "Orçamento não encontrado" };
    const currency = input.currency.trim().toUpperCase();
    if (!CURRENCY_RE.test(currency) || currency === "BRL") return { error: "Informe uma moeda de 3 letras diferente de BRL" };
    const supabase = await createClient();
    const rows = input.rates
      .map((rate, i) => ({ rate, month: i + 1 }))
      .filter((x) => Number.isFinite(x.rate) && x.rate > 0)
      .map((x) => ({
        tenant_id: tenant.tenantId,
        orcamento_id: input.orcamentoId,
        currency,
        year: orc.year,
        month: x.month,
        rate: x.rate,
      }));
    const { error: delErr } = await supabase
      .from("currency_rates")
      .delete()
      .eq("tenant_id", tenant.tenantId)
      .eq("orcamento_id", input.orcamentoId)
      .eq("year", orc.year)
      .eq("currency", currency);
    if (delErr) return { error: delErr.message };
    if (rows.length > 0) {
      const { error } = await supabase.from("currency_rates").insert(rows);
      if (error) return { error: error.message };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

export async function applyAssumption(input: {
  orcamentoId: string;
  entityNodeId: string | null;
  kind: "price_adjust" | "volume_growth";
  pct: number;
  fromMonth: number;
  productId?: string | null;
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { error: "Orçamento não encontrado" };
    if (!Number.isFinite(input.pct) || input.pct <= -100 || input.pct > 1000) return { error: "Percentual inválido" };
    if (input.fromMonth < 1 || input.fromMonth > 12) return { error: "Mês inválido" };

    const supabase = await createClient();
    let q = supabase
      .from("revenue_entries")
      .select("id, product_node_id, month, currency, volume, unit_price")
      .eq("tenant_id", tenant.tenantId)
      .eq("orcamento_id", input.orcamentoId)
      .eq("year", orc.year)
      .eq("extra_dimensions", "{}");
    q = input.entityNodeId ? q.eq("entity_node_id", input.entityNodeId) : q.is("entity_node_id", null);
    const { data, error } = await q;
    if (error) return { error: error.message };
    const rows = data ?? [];
    const lines: RevenueLine[] = rows.map((r) => ({
      productId: r.product_node_id,
      month: r.month,
      currency: r.currency,
      volume: Number(r.volume),
      unitPrice: Number(r.unit_price),
    }));
    const next =
      input.kind === "price_adjust"
        ? applyPriceAdjust(lines, input.pct, input.fromMonth, input.productId ?? undefined)
        : applyVolumeGrowth(lines, input.pct, input.fromMonth, input.productId ?? undefined);

    for (let i = 0; i < rows.length; i++) {
      if (next[i].volume === lines[i].volume && next[i].unitPrice === lines[i].unitPrice) continue;
      const { error: upErr } = await supabase
        .from("revenue_entries")
        .update({ volume: next[i].volume, unit_price: next[i].unitPrice, updated_at: new Date().toISOString() })
        .eq("id", rows[i].id)
        .eq("tenant_id", tenant.tenantId);
      if (upErr) return { error: upErr.message };
    }
    await supabase.from("revenue_assumptions").insert({
      tenant_id: tenant.tenantId,
      orcamento_id: input.orcamentoId,
      kind: input.kind,
      product_node_id: input.productId ?? null,
      params: { pct: input.pct, fromMonth: input.fromMonth, entityNodeId: input.entityNodeId },
    });
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao aplicar premissa" };
  }
}

/**
 * Atalho de primeira vez: cria a dimensão "Produto" (se não existir) e
 * cadastra os produtos informados, tudo de uma vez. Os produtos entram
 * sob um item raiz "Produtos" (cada estrutura admite uma única raiz).
 */
export async function setupProdutos(input: { orcamentoId: string; names: string[] }): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { error: "Orçamento não encontrado" };
    const names = Array.from(new Set(input.names.map((n) => n.trim()).filter(Boolean))).slice(0, 200);
    if (names.length === 0) return { error: "Informe pelo menos um produto." };

    const supabase = await createClient();
    const findType = async () => {
      const { data } = await supabase
        .from("dimension_types")
        .select("id")
        .eq("tenant_id", tenant.tenantId)
        .eq("code", "produto")
        .maybeSingle();
      return data?.id as string | undefined;
    };

    let typeId = await findType();
    if (!typeId) {
      const r = await createDimensionType({ code: "produto", name: "Produto", description: "Produtos e serviços vendidos" });
      if (r.error) return { error: r.error };
      typeId = await findType();
      if (!typeId) return { error: "Não foi possível criar a hierarquia Produto." };
    }

    const { count } = await supabase
      .from("dimension_nodes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.tenantId)
      .eq("dimension_type_id", typeId);
    if ((count ?? 0) > 0) return { error: "A hierarquia Produto já tem itens. Gerencie-os em Parâmetros." };

    const root = await createDimensionNode({ dimensionTypeId: typeId, code: "PROD", name: "Produtos", parentNodeId: null, year: orc.year });
    if (root.error) return { error: root.error };
    const { data: rootNode } = await supabase
      .from("dimension_nodes")
      .select("id")
      .eq("tenant_id", tenant.tenantId)
      .eq("dimension_type_id", typeId)
      .eq("code", "PROD")
      .maybeSingle();
    if (!rootNode) return { error: "Não foi possível criar o item raiz." };

    for (let i = 0; i < names.length; i++) {
      const r = await createDimensionNode({
        dimensionTypeId: typeId,
        code: `P${String(i + 1).padStart(3, "0")}`,
        name: names[i],
        parentNodeId: rootNode.id,
        year: orc.year,
      });
      if (r.error) return { error: `Erro em "${names[i]}": ${r.error}` };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao cadastrar produtos" };
  }
}
