import { createClient } from "@/lib/supabase/server";
import type { ModuleType } from "./types";

export async function getModules(tenantId: string): Promise<ModuleType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modules")
    .select("id, tenant_id, code, name, sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Mapa dimension_type_id -> lista de module_id associados, para a tenant
 * inteira em uma única query (evita N+1 ao montar a tabela de Parâmetros).
 */
export async function getDimensionTypeModuleIds(
  tenantId: string
): Promise<Record<string, string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dimension_type_modules")
    .select("dimension_type_id, module_id")
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    (map[row.dimension_type_id] ??= []).push(row.module_id);
  }
  return map;
}
