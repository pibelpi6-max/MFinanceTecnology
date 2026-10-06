import { createClient } from "@/lib/supabase/server";
import { isProtectedDimensionCode } from "./constants";
import type { DimensionType, DimensionNodeRow, DimensionStructure } from "./types";

const DIMENSION_TYPE_COLUMNS = "id, tenant_id, code, name, description, is_system, sort_order, use_in_matriz";
const DIMENSION_STRUCTURE_COLUMNS = "id, tenant_id, dimension_type_id, name, is_active, sort_order";

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

/**
 * Todas as "Estruturas" (árvores nomeadas) de um tenant, agrupadas por
 * dimension_type_id — 1 query só, ordenadas por sort_order. Usada pela
 * tela de Parâmetros (ConfiguracoesClient) pra montar a lista de
 * estruturas de cada dimensão.
 */
export async function getDimensionStructuresByType(
  tenantId: string
): Promise<Record<string, DimensionStructure[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dimension_structures")
    .select(DIMENSION_STRUCTURE_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  const map: Record<string, DimensionStructure[]> = {};
  for (const s of data ?? []) {
    (map[s.dimension_type_id] ??= []).push(s);
  }
  return map;
}

/**
 * Id da estrutura ATIVA de uma dimensão — ou null se a dimensão não
 * tiver nenhuma estrutura ativa no momento.
 *
 * Desde a migration 0014, "Ativa" deixou de ser exclusiva por dimensão
 * (o índice único parcial da 0012 foi removido — ver
 * claude/decisoes-arquitetura.md, "Orçamento (entidade nova,
 * versões/revisões)"): várias estruturas podem estar marcadas "Ativa"
 * ao mesmo tempo. Esta função é a ponte de compatibilidade enquanto
 * Matriz/Pacotes/Realizado/Comparativo ainda não foram religados para
 * resolver a estrutura através do Orçamento — por isso usa `limit(1)`
 * em vez de `maybeSingle()` (que lançaria erro com mais de 1 linha) e
 * pega a primeira por `sort_order`, de forma determinística. Isso evita
 * quebrar essas telas se a usuária ativar mais de uma estrutura antes
 * da próxima etapa (religar via Orçamento) estar pronta — é só uma
 * salvaguarda, não a resolução "de verdade" do Conjunto de Estruturas.
 */
async function getActiveStructureId(
  tenantId: string,
  dimensionTypeId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dimension_structures")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("dimension_type_id", dimensionTypeId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0]?.id ?? null;
}

/**
 * Árvore de itens de uma Estrutura específica (ver dimension_structures,
 * migration 0012). Base de getDimensionTree abaixo e usada diretamente
 * pela tela de Parâmetros, que precisa mostrar/editar QUALQUER estrutura
 * (ativa ou não), não só a ativa.
 */
export async function getDimensionTreeByStructure(
  tenantId: string,
  structureId: string,
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
    .eq("structure_id", structureId)
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

/**
 * Árvore de itens de uma dimensão, pelo tipo — resolve sozinha qual é a
 * Estrutura ATIVA daquele tipo e devolve a árvore dela (ou [] se não
 * houver nenhuma estrutura ativa no momento). Mantida com a mesma
 * assinatura de antes das "Estruturas" (migration 0012) de propósito:
 * Matriz, Comparativo, Realizado, Pacotes e os assistentes de importação
 * continuam chamando com (tenantId, dimensionTypeId, year) sem nenhuma
 * mudança — sempre leem a estrutura ativa, exatamente como quando só
 * existia uma árvore por tipo.
 */
export async function getDimensionTree(
  tenantId: string,
  dimensionTypeId: string,
  year: number
): Promise<DimensionNodeRow[]> {
  const structureId = await getActiveStructureId(tenantId, dimensionTypeId);
  if (!structureId) return [];
  return getDimensionTreeByStructure(tenantId, structureId, year);
}
