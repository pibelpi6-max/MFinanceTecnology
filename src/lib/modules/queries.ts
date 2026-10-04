import { createClient } from "@/lib/supabase/server";
import type { DimensionType } from "@/lib/dimensions/types";
import { isProtectedDimensionCode } from "@/lib/dimensions/constants";
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

/**
 * Tipos de dimensão marcados num módulo específico, já excluindo os 3
 * códigos protegidos (conta/centro_custo/entidade) — esses já são eixos
 * fixos de qualquer tela que use o motor da Matriz Orçamentária, então
 * nunca entram como "eixo extra" mesmo que alguém os marque no módulo.
 */
export async function getModuleDimensionTypes(
  tenantId: string,
  moduleId: string | null
): Promise<DimensionType[]> {
  if (!moduleId) return [];

  const supabase = await createClient();
  const { data: links, error: linksError } = await supabase
    .from("dimension_type_modules")
    .select("dimension_type_id")
    .eq("tenant_id", tenantId)
    .eq("module_id", moduleId);
  if (linksError) throw new Error(linksError.message);

  const ids = (links ?? []).map((l) => l.dimension_type_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("dimension_types")
    .select("id, tenant_id, code, name, description, is_system, sort_order")
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).filter((d) => !isProtectedDimensionCode(d.code));
}
