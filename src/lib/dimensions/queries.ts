import { createClient } from "@/lib/supabase/server";
import type { DimensionType, DimensionNodeRow } from "./types";

export async function getDimensionTypes(
  tenantId: string
): Promise<DimensionType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dimension_types")
    .select("id, tenant_id, code, name, is_system, sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDimensionTypeByCode(
  tenantId: string,
  code: string
): Promise<DimensionType | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dimension_types")
    .select("id, tenant_id, code, name, is_system, sort_order")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function getDimensionTree(
  tenantId: string,
  dimensionTypeId: string,
  year: number
): Promise<DimensionNodeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dimension_nodes")
    .select(
      `id, code,
       dimension_node_versions!inner (
         id, name, parent_node_id, level, valid_from_year, valid_until_year
       )`
    )
    .eq("tenant_id", tenantId)
    .eq("dimension_type_id", dimensionTypeId)
    .lte("dimension_node_versions.valid_from_year", year)
    .or(
      `valid_until_year.is.null,valid_until_year.gte.${year}`,
      { foreignTable: "dimension_node_versions" }
    );

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const v = Array.isArray(row.dimension_node_versions)
      ? row.dimension_node_versions[0]
      : row.dimension_node_versions;
    return {
      id: row.id,
      versionId: v.id,
      code: row.code,
      name: v.name,
      parentNodeId: v.parent_node_id,
      level: v.level,
      validFromYear: v.valid_from_year,
      validUntilYear: v.valid_until_year,
    } as DimensionNodeRow;
  });
}
