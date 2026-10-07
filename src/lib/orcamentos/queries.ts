import { createClient } from "@/lib/supabase/server";
import type { ConjuntoEstrutura, ConjuntoEstruturaItem, Orcamento } from "./types";

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
    .select("id, tenant_id, year, label, status, conjunto_estrutura_id, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("year", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
