import { createClient } from "@/lib/supabase/server";
import { isProtectedDimensionCode } from "./constants";
import type { DimensionType, DimensionNodeRow } from "./types";

const DIMENSION_TYPE_COLUMNS = "id, tenant_id, code, name, description, is_system, sort_order, use_in_matriz";

export async function getDimensionTypes(
  tenantId: string
): Promise<DimensionType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dimension_types")
    .select(DIMENSION_TYPE_COLUMNS)
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
    .select(DIMENSION_TYPE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Dimensões marcadas pela usuária (use_in_matriz=true) para aparecer
 * como eixo extra (filtro) na Matriz Orçamentária — substitui a antiga
 * indireção por "módulos" (ver 0011_matriz_eixos_extras.sql). Os 3
 * códigos protegidos (conta/centro_custo/entidade) são excluídos por
 * segurança, mesmo que nunca devam chegar com use_in_matriz=true (já
 * são eixos fixos de qualquer tela que use o motor da Matriz).
 */
export async function getMatrizExtraDimensionTypes(
  tenantId: string
): Promise<DimensionType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dimension_types")
    .select(DIMENSION_TYPE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("use_in_matriz", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).filter((d) => !isProtectedDimensionCode(d.code));
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
       dimension_node_versions!dimension_node_id!inner (
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
