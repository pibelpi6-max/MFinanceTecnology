import { createClient } from "@/lib/supabase/server";
import type { Deduction, RateTable, RevenueLine } from "./calc";

export interface ReceitaEntry extends RevenueLine {
  entityId: string | null;
  /** Demais dimensões da venda: id do tipo de hierarquia -> id do item. */
  extra: Record<string, string>;
}

/** Hierarquias que as vendas do orçamento carregam. Tolerante: sem a migration 0028 devolve []. */
export async function getRevenueDimensionIds(tenantId: string, orcamentoId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orcamentos")
    .select("revenue_dimension_type_ids")
    .eq("tenant_id", tenantId)
    .eq("id", orcamentoId)
    .maybeSingle();
  if (error || !data) return [];
  const ids = (data as { revenue_dimension_type_ids?: string[] | null }).revenue_dimension_type_ids;
  return Array.isArray(ids) ? ids : [];
}

export interface ReceitaData {
  entries: ReceitaEntry[];
  deductions: Deduction[];
  rates: RateTable;
  currencies: string[];
}

export async function getReceitaData(tenantId: string, orcamentoId: string, year: number): Promise<ReceitaData> {
  const supabase = await createClient();
  const [e, d, r] = await Promise.all([
    supabase
      .from("revenue_entries")
      .select("product_node_id, entity_node_id, extra_dimensions, month, currency, volume, unit_price")
      .eq("tenant_id", tenantId)
      .eq("orcamento_id", orcamentoId)
      .eq("year", year),
    supabase
      .from("revenue_deductions")
      .select("product_node_id, code, label, pct, sort_order")
      .eq("tenant_id", tenantId)
      .eq("orcamento_id", orcamentoId)
      .order("sort_order"),
    supabase
      .from("currency_rates")
      .select("currency, month, rate")
      .eq("tenant_id", tenantId)
      .eq("orcamento_id", orcamentoId)
      .eq("year", year),
  ]);
  if (e.error) throw new Error(e.error.message);
  if (d.error) throw new Error(d.error.message);
  if (r.error) throw new Error(r.error.message);

  const entries: ReceitaEntry[] = (e.data ?? []).map((x) => ({
    productId: x.product_node_id,
    entityId: x.entity_node_id,
    extra: (x.extra_dimensions && typeof x.extra_dimensions === "object" ? x.extra_dimensions : {}) as Record<string, string>,
    month: x.month,
    currency: x.currency,
    volume: Number(x.volume),
    unitPrice: Number(x.unit_price),
  }));
  const deductions: Deduction[] = (d.data ?? []).map((x) => ({
    productId: x.product_node_id,
    code: x.code,
    label: x.label,
    pct: Number(x.pct),
  }));
  const rates: RateTable = {};
  for (const x of r.data ?? []) (rates[x.currency] ??= {})[x.month] = Number(x.rate);

  const currencies = Array.from(new Set(["BRL", ...entries.map((x) => x.currency), ...Object.keys(rates)]));
  return { entries, deductions, rates, currencies };
}

export type ItemKind = "produto" | "servico";

/** Itens marcados como serviço (o resto é produto). Tolera a tabela ainda não existir. */
export async function getItemKinds(tenantId: string): Promise<Record<string, ItemKind>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revenue_item_kinds")
    .select("dimension_node_id, kind")
    .eq("tenant_id", tenantId);
  const out: Record<string, ItemKind> = {};
  if (error) return out;
  for (const r of data ?? []) out[r.dimension_node_id] = r.kind as ItemKind;
  return out;
}

/** Nomes de dedução já cadastrados em qualquer orçamento da empresa (viram atalhos reutilizáveis). */
export async function getDeductionLabels(tenantId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("revenue_deductions").select("label").eq("tenant_id", tenantId);
  if (error) return [];
  return Array.from(new Set((data ?? []).map((r) => String(r.label).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export interface DeductionDefault {
  label: string;
  pct: number;
}

/** Deduções padrão da empresa. Tolera a tabela ainda não existir (migration 0023). */
export async function getDeductionDefaults(tenantId: string, orcamentoId: string): Promise<DeductionDefault[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revenue_deduction_defaults")
    .select("label, pct, sort_order")
    .eq("tenant_id", tenantId)
    .eq("orcamento_id", orcamentoId)
    .order("sort_order");
  if (error) return [];
  return (data ?? []).map((r) => ({ label: String(r.label), pct: Number(r.pct) }));
}

export interface DeductionRuleRow {
  label: string;
  entityId: string | null;
  productId: string | null;
  pct: number;
}

/** Condições especiais por estrutura. Tolera a tabela ainda não existir (migration 0024). */
export async function getDeductionRules(tenantId: string, orcamentoId: string): Promise<DeductionRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revenue_deduction_rules")
    .select("label, entity_node_id, product_node_id, pct, sort_order")
    .eq("tenant_id", tenantId)
    .eq("orcamento_id", orcamentoId)
    .order("sort_order");
  if (error) return [];
  return (data ?? []).map((r) => ({
    label: String(r.label),
    entityId: r.entity_node_id,
    productId: r.product_node_id,
    pct: Number(r.pct),
  }));
}


export interface PremiseRow {
  id: string;
  kind: "volume_growth" | "price_adjust";
  pct: number;
  fromMonth: number;
  base: "entered" | "previous_month" | "other_budget";
  baseOrcamentoId: string | null;
  productIds: string[];
  dimensionFilters: Record<string, string[]>;
  isActive: boolean;
}

/** Premissas guardadas do orçamento. Tolera a tabela ainda não existir (migration 0027). */
export async function getPremises(tenantId: string, orcamentoId: string): Promise<PremiseRow[]> {
  const supabase = await createClient();
  const q = (cols: string) =>
    supabase
      .from("revenue_premises")
      .select(cols)
      .eq("tenant_id", tenantId)
      .eq("orcamento_id", orcamentoId)
      .order("sort_order")
      .order("created_at");
  // Tolera a migration 0029 ainda não rodada (coluna base_orcamento_id).
  let res = await q("id, kind, pct, from_month, base, base_orcamento_id, product_node_ids, dimension_filters, is_active");
  if (res.error) res = await q("id, kind, pct, from_month, base, product_node_ids, dimension_filters, is_active");
  if (res.error) return [];
  type Raw = { id: string; kind: PremiseRow["kind"]; pct: number | string; from_month: number | string; base: PremiseRow["base"]; base_orcamento_id?: string | null; product_node_ids: string[] | null; dimension_filters: Record<string, string[]> | null; is_active: boolean };
  return ((res.data ?? []) as unknown as Raw[]).map((r) => ({
    id: String(r.id),
    kind: r.kind,
    pct: Number(r.pct),
    fromMonth: Number(r.from_month),
    base: r.base,
    baseOrcamentoId: r.base_orcamento_id ?? null,
    productIds: (r.product_node_ids ?? []) as string[],
    dimensionFilters: (r.dimension_filters ?? {}) as Record<string, string[]>,
    isActive: !!r.is_active,
  }));
}

/** Lançamentos de receita de outros orçamentos (base de premissas). */
export async function getReferenceEntries(tenantId: string, orcamentoIds: string[]): Promise<Record<string, ReceitaEntry[]>> {
  const out: Record<string, ReceitaEntry[]> = {};
  if (orcamentoIds.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revenue_entries")
    .select("orcamento_id, product_node_id, entity_node_id, extra_dimensions, month, currency, volume, unit_price")
    .eq("tenant_id", tenantId)
    .in("orcamento_id", orcamentoIds);
  if (error) return out;
  for (const x of data ?? []) {
    (out[x.orcamento_id] ??= []).push({
      productId: x.product_node_id,
      entityId: x.entity_node_id,
      extra: (x.extra_dimensions && typeof x.extra_dimensions === "object" ? x.extra_dimensions : {}) as Record<string, string>,
      month: x.month,
      currency: x.currency,
      volume: Number(x.volume),
      unitPrice: Number(x.unit_price),
    });
  }
  return out;
}

export interface TenantCurrency {
  code: string;
  name: string;
}

/** Moedas cadastradas em Parâmetros. Tolera a tabela ainda não existir (migration 0031). */
export async function getTenantCurrencies(tenantId: string): Promise<TenantCurrency[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tenant_currencies").select("code, name").eq("tenant_id", tenantId).order("code");
  if (error) return [];
  return (data ?? []).map((r) => ({ code: String(r.code), name: String(r.name ?? "") }));
}
