import { createClient } from "@/lib/supabase/server";
import type { Deduction, RateTable, RevenueLine } from "./calc";

export interface ReceitaEntry extends RevenueLine {
  entityId: string | null;
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
      .select("product_node_id, entity_node_id, month, currency, volume, unit_price")
      .eq("tenant_id", tenantId)
      .eq("orcamento_id", orcamentoId)
      .eq("year", year)
      .eq("extra_dimensions", "{}"),
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
export async function getDeductionDefaults(tenantId: string): Promise<DeductionDefault[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revenue_deduction_defaults")
    .select("label, pct, sort_order")
    .eq("tenant_id", tenantId)
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
export async function getDeductionRules(tenantId: string): Promise<DeductionRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revenue_deduction_rules")
    .select("label, entity_node_id, product_node_id, pct, sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order");
  if (error) return [];
  return (data ?? []).map((r) => ({
    label: String(r.label),
    entityId: r.entity_node_id,
    productId: r.product_node_id,
    pct: Number(r.pct),
  }));
}
