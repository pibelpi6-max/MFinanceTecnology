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
