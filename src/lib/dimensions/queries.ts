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
 * ao mesmo tempo. Esta função é usada como FALLBACK por getDimensionTree
 * abaixo, só quando não há Orçamento selecionado (sem conjuntoEstruturaId)
 * ou quando o Conjunto do Orçamento selecionado não mapeia este tipo de
 * dimensão — por isso usa `limit(1)` em vez de `maybeSingle()` (que
 * lançaria erro com mais de 1 linha) e pega a primeira por `sort_order`,
 * de forma determinística.
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
 * Estrutura que o Conjunto de Estruturas do Orçamento selecionado
 * escolheu para este tipo de dimensão — ou null se o Conjunto não
 * cobre esse tipo (ver conjunto_estrutura_items, migration 0014).
 */
async function getConjuntoStructureId(
  conjuntoEstruturaId: string,
  dimensionTypeId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conjunto_estrutura_items")
    .select("structure_id")
    .eq("conjunto_id", conjuntoEstruturaId)
    .eq("dimension_type_id", dimensionTypeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.structure_id ?? null;
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
  year: number,
  anyYear = false
): Promise<DimensionNodeRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("dimension_nodes")
    .select(
      `id, code, sort_order,
       dimension_node_versions!dimension_node_id!inner (
         id, name, parent_node_id, level, valid_from_year, valid_until_year
       )`
    )
    .eq("tenant_id", tenantId)
    .eq("structure_id", structureId);
  // Cadastros gerais (ex.: produtos) valem para todos os anos: ignora a vigência.
  if (!anyYear) {
    q = q
      .lte("dimension_node_versions.valid_from_year", year)
      .or(`valid_until_year.is.null,valid_until_year.gte.${year}`, { foreignTable: "dimension_node_versions" });
  }
  const { data, error } = await q;

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const versions = Array.isArray(row.dimension_node_versions) ? row.dimension_node_versions : [row.dimension_node_versions];
    const v = anyYear ? [...versions].sort((a, b) => b.valid_from_year - a.valid_from_year)[0] : versions[0];
    return {
      id: row.id,
      versionId: v.id,
      code: row.code,
      sortOrder: row.sort_order ?? 0,
      name: v.name,
      parentNodeId: v.parent_node_id,
      level: v.level,
      validFromYear: v.valid_from_year,
      validUntilYear: v.valid_until_year,
    } as DimensionNodeRow;
  });
}

/**
 * Árvore de itens de uma dimensão, pelo tipo — resolve qual Estrutura
 * usar e devolve a árvore dela (ou [] se não houver nenhuma estrutura
 * disponível). Religada ao Orçamento (ver claude/decisoes-arquitetura.md
 * e migration 0015_religar_orcamento.sql): quando a chamadora passa o
 * `conjuntoEstruturaId` do Orçamento selecionado, a estrutura vem do
 * Conjunto; se o Conjunto não mapear esse tipo de dimensão (ou nenhum
 * Orçamento estiver selecionado), cai no fallback antigo — a Estrutura
 * marcada "Ativa" — mantendo Parâmetros, importadores e qualquer tela
 * ainda não religada funcionando como antes.
 */
export async function getDimensionTree(
  tenantId: string,
  dimensionTypeId: string,
  year: number,
  conjuntoEstruturaId?: string | null,
  anyYear = false
): Promise<DimensionNodeRow[]> {
  const structureId = conjuntoEstruturaId
    ? (await getConjuntoStructureId(conjuntoEstruturaId, dimensionTypeId)) ??
      (await getActiveStructureId(tenantId, dimensionTypeId))
    : await getActiveStructureId(tenantId, dimensionTypeId);
  if (!structureId) return [];
  return getDimensionTreeByStructure(tenantId, structureId, year, anyYear);
}
