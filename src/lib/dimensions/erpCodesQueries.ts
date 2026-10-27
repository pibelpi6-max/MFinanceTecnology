import { createClient } from "@/lib/supabase/server";

/** Códigos do ERP de todos os itens do tenant, agrupados por item. */
export async function getErpCodesByNode(tenantId: string): Promise<Record<string, string[]>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dimension_node_codes")
    .select("dimension_node_id, erp_code")
    .eq("tenant_id", tenantId)
    .order("erp_code");
  const map: Record<string, string[]> = {};
  (data ?? []).forEach((r) => {
    (map[r.dimension_node_id] ??= []).push(r.erp_code);
  });
  return map;
}
