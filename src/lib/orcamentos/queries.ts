import { createClient } from "@/lib/supabase/server";
import { getUserPreference } from "@/app/_actions/userPreferences";
import type { ConjuntoEstrutura, ConjuntoEstruturaItem, Orcamento } from "./types";

export const ORCAMENTO_COLUMNS =
  "id, tenant_id, year, label, status, tipo, oficial, description, conjunto_estrutura_id, created_at, updated_at";

function orcamentoAtualKey(tenantId: string) {
  return `orcamento_atual:${tenantId}`;
}

/**
 * Lê qual Orçamento está selecionado no seletor global (AdminHeader) —
 * guardado por usuário em user_preferences, mesmo mecanismo já usado
 * por sidebar_collapsed/locale. `null` = "Sem Orçamento (dados legados)",
 * a opção explícita do seletor para o bucket implícito de lançamentos
 * sem orcamento_id (ver migration 0015_religar_orcamento.sql).
 */
export async function getOrcamentoAtualId(tenantId: string): Promise<string | null> {
  const pref = await getUserPreference<{ orcamentoId: string | null }>(orcamentoAtualKey(tenantId));
  return pref?.orcamentoId ?? null;
}

export async function getOrcamentoById(tenantId: string, id: string): Promise<Orcamento | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orcamentos")
    .select(ORCAMENTO_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export interface OrcamentoContext {
  /** Orçamento selecionado no seletor global — null = bucket legado (sem Orçamento). */
  orcamentoId: string | null;
  /** Conjunto de Estruturas do Orçamento selecionado, se houver (ver getDimensionTree). */
  conjuntoEstruturaId: string | null;
  orcamento: Orcamento | null;
}

/**
 * Resolve de uma vez só o que Matriz/Pacotes/Realizado/Comparativo
 * precisam saber sobre o Orçamento em uso: qual é (se houver), e qual
 * Conjunto de Estruturas ele define (pra resolver as árvores de
 * dimensão — ver getDimensionTree em src/lib/dimensions/queries.ts).
 * Se a preferência apontar pra um Orçamento que não existe mais (foi
 * excluído em outra aba, por exemplo), cai no bucket legado em vez de
 * quebrar a tela.
 */
export async function getOrcamentoContext(tenantId: string): Promise<OrcamentoContext> {
  const orcamentoId = await getOrcamentoAtualId(tenantId);
  if (!orcamentoId) return { orcamentoId: null, conjuntoEstruturaId: null, orcamento: null };

  const orcamento = await getOrcamentoById(tenantId, orcamentoId);
  if (!orcamento) return { orcamentoId: null, conjuntoEstruturaId: null, orcamento: null };

  return { orcamentoId: orcamento.id, conjuntoEstruturaId: orcamento.conjunto_estrutura_id, orcamento };
}

export interface ConjuntoEstruturaWithItems extends ConjuntoEstrutura {
  items: ConjuntoEstruturaItem[];
}

/**
 * Todos os Conjuntos de Estrutura de um tenant, já com seus itens (1
 * Estrutura escolhida por tipo de dimensão) — usado pela tela de
 * Parâmetros (gestão dos Conjuntos) e pelo seletor de Conjunto no
 * formulário de Orçamento.
 */
export async function getConjuntosByTenant(tenantId: string): Promise<ConjuntoEstruturaWithItems[]> {
  const supabase = await createClient();
  const { data: conjuntos, error } = await supabase
    .from("conjuntos_estrutura")
    .select("id, tenant_id, name, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!conjuntos || conjuntos.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("conjunto_estrutura_items")
    .select("id, conjunto_id, dimension_type_id, structure_id")
    .in(
      "conjunto_id",
      conjuntos.map((c) => c.id)
    );
  if (itemsError) throw new Error(itemsError.message);

  const itemsByConjunto = new Map<string, ConjuntoEstruturaItem[]>();
  (items ?? []).forEach((it) => {
    const list = itemsByConjunto.get(it.conjunto_id) ?? [];
    list.push(it);
    itemsByConjunto.set(it.conjunto_id, list);
  });

  return conjuntos.map((c) => ({ ...c, items: itemsByConjunto.get(c.id) ?? [] }));
}

/**
 * Quantos Conjuntos referenciam cada Estrutura — alimenta o contador
 * "Usada em N conjuntos" ao lado da pill Ativa/Inativa em Parâmetros
 * (ver claude/decisoes-arquitetura.md, "Orçamento (entidade nova,
 * versões/revisões)"). Chave = structure_id, valor = contagem.
 */
export async function getStructureUsageCounts(tenantId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data: conjuntoIds, error: conjuntoError } = await supabase
    .from("conjuntos_estrutura")
    .select("id")
    .eq("tenant_id", tenantId);
  if (conjuntoError) throw new Error(conjuntoError.message);
  if (!conjuntoIds || conjuntoIds.length === 0) return {};

  const { data: items, error } = await supabase
    .from("conjunto_estrutura_items")
    .select("structure_id")
    .in(
      "conjunto_id",
      conjuntoIds.map((c) => c.id)
    );
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  (items ?? []).forEach((it) => {
    counts[it.structure_id] = (counts[it.structure_id] ?? 0) + 1;
  });
  return counts;
}

/** Orçamentos de um tenant (todas as revisões/anos), mais recentes primeiro. */
export async function getOrcamentosByTenant(tenantId: string): Promise<Orcamento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orcamentos")
    .select(ORCAMENTO_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("year", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Quantos pacotes cada Orçamento tem — chave = orcamento_id. */
export async function getPackageCountsByOrcamento(tenantId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_packages")
    .select("orcamento_id")
    .eq("tenant_id", tenantId)
    .not("orcamento_id", "is", null);
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  (data ?? []).forEach((row) => {
    if (row.orcamento_id) counts[row.orcamento_id] = (counts[row.orcamento_id] ?? 0) + 1;
  });
  return counts;
}
