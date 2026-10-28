"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { createDimensionType } from "@/app/admin/configuracoes/_actions";
import { createDimensionNode, updateDimensionNode } from "@/app/admin/dimensoes/_actions";

interface Result {
  success?: true;
  error?: string;
}

const CURRENCY_RE = /^[A-Z]{3}$/;

function refresh(orcamentoId: string) {
  revalidatePath(`/admin/orcamentos/${orcamentoId}/receita`);
}

async function assertOrcamento(tenantId: string, orcamentoId: string): Promise<{ year: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orcamentos")
    .select("year")
    .eq("id", orcamentoId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data ? { year: data.year } : null;
}

export async function saveRevenueEntries(input: {
  orcamentoId: string;
  entityNodeId: string | null;
  currencyByProduct: Record<string, string>;
  cells: { productId: string; month: number; volume: number; unitPrice: number }[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { error: "Orçamento não encontrado" };
    if (input.cells.length === 0) return { success: true };

    const rows = [];
    for (const c of input.cells) {
      const currency = input.currencyByProduct[c.productId] ?? "BRL";
      if (!CURRENCY_RE.test(currency)) return { error: "Moeda inválida" };
      if (c.month < 1 || c.month > 12) return { error: "Mês inválido" };
      if (!Number.isFinite(c.volume) || !Number.isFinite(c.unitPrice) || c.volume < 0 || c.unitPrice < 0) {
        return { error: "Volume e preço devem ser números positivos" };
      }
      rows.push({
        tenant_id: tenant.tenantId,
        orcamento_id: input.orcamentoId,
        year: orc.year,
        month: c.month,
        product_node_id: c.productId,
        entity_node_id: input.entityNodeId,
        extra_dimensions: {},
        currency,
        volume: c.volume,
        unit_price: c.unitPrice,
        updated_at: new Date().toISOString(),
      });
    }

    const supabase = await createClient();
    // Se a moeda do produto mudou, remove as linhas antigas (outra moeda) do mesmo produto/entidade.
    const productIds = Array.from(new Set(input.cells.map((c) => c.productId)));
    for (const pid of productIds) {
      const cur = input.currencyByProduct[pid] ?? "BRL";
      let del = supabase
        .from("revenue_entries")
        .delete()
        .eq("tenant_id", tenant.tenantId)
        .eq("orcamento_id", input.orcamentoId)
        .eq("year", orc.year)
        .eq("product_node_id", pid)
        .neq("currency", cur);
      del = input.entityNodeId ? del.eq("entity_node_id", input.entityNodeId) : del.is("entity_node_id", null);
      const { error: delErr } = await del;
      if (delErr) return { error: delErr.message };
    }
    const { error } = await supabase.from("revenue_entries").upsert(rows, {
      onConflict: "tenant_id,orcamento_id,year,month,product_node_id,entity_node_id,extra_dimensions,currency",
    });
    if (error) return { error: error.message };
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

export async function saveDeductions(input: {
  orcamentoId: string;
  productId: string;
  items: { code: string; label: string; pct: number }[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (!(await assertOrcamento(tenant.tenantId, input.orcamentoId))) return { error: "Orçamento não encontrado" };
    for (const i of input.items) {
      if (!i.label.trim()) return { error: "Informe o nome de cada dedução" };
      if (!Number.isFinite(i.pct) || i.pct < 0 || i.pct > 100) return { error: "Percentual deve estar entre 0 e 100" };
    }
    const supabase = await createClient();
    const { error: delErr } = await supabase
      .from("revenue_deductions")
      .delete()
      .eq("tenant_id", tenant.tenantId)
      .eq("orcamento_id", input.orcamentoId)
      .eq("product_node_id", input.productId);
    if (delErr) return { error: delErr.message };
    if (input.items.length > 0) {
      const { error } = await supabase.from("revenue_deductions").insert(
        input.items.map((i, idx) => ({
          tenant_id: tenant.tenantId,
          orcamento_id: input.orcamentoId,
          product_node_id: input.productId,
          code: `${idx}_${i.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}`.slice(0, 60),
          label: i.label.trim(),
          pct: i.pct,
          sort_order: idx,
        }))
      );
      if (error) return { error: error.message };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

export async function saveDeductionsBulk(input: {
  orcamentoId: string;
  productIds: string[];
  items: { label: string; pct: number }[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (!(await assertOrcamento(tenant.tenantId, input.orcamentoId))) return { error: "Orçamento não encontrado" };
    for (const i of input.items) {
      if (!i.label.trim()) return { error: "Informe o nome de cada dedução" };
      if (!Number.isFinite(i.pct) || i.pct < 0 || i.pct > 100) return { error: "Percentual deve estar entre 0 e 100" };
    }
    if (input.productIds.length === 0) return { success: true };
    const supabase = await createClient();
    const { error: delErr } = await supabase
      .from("revenue_deductions")
      .delete()
      .eq("tenant_id", tenant.tenantId)
      .eq("orcamento_id", input.orcamentoId)
      .in("product_node_id", input.productIds);
    if (delErr) return { error: delErr.message };
    const rows = input.productIds.flatMap((pid) =>
      input.items.map((i, idx) => ({
        tenant_id: tenant.tenantId,
        orcamento_id: input.orcamentoId,
        product_node_id: pid,
        code: `${idx}_${i.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}`.slice(0, 60),
        label: i.label.trim(),
        pct: i.pct,
        sort_order: idx,
      })),
    );
    for (let n = 0; n < rows.length; n += 500) {
      const { error } = await supabase.from("revenue_deductions").insert(rows.slice(n, n + 500));
      if (error) return { error: error.message };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

export async function saveDeductionDefaults(input: {
  orcamentoId: string;
  items: { label: string; pct: number }[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const seen = new Set<string>();
    const items: { label: string; pct: number }[] = [];
    for (const i of input.items) {
      const label = i.label.trim();
      if (!label) continue;
      if (!Number.isFinite(i.pct) || i.pct < 0 || i.pct > 100) return { error: "Percentual deve estar entre 0 e 100" };
      if (seen.has(label.toLowerCase())) return { error: `A dedução ${label} está repetida` };
      seen.add(label.toLowerCase());
      items.push({ label, pct: i.pct });
    }
    const supabase = await createClient();
    const hint = "Rode a migration 0023 (deduções padrão) no Supabase antes de salvar.";
    const del = await supabase.from("revenue_deduction_defaults").delete().eq("tenant_id", tenant.tenantId);
    if (del.error) return { error: /does not exist|schema cache|permission/i.test(del.error.message) ? hint : del.error.message };
    if (items.length > 0) {
      const ins = await supabase.from("revenue_deduction_defaults").insert(
        items.map((i, idx) => ({ tenant_id: tenant.tenantId, label: i.label, pct: i.pct, sort_order: idx })),
      );
      if (ins.error) return { error: ins.error.message };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

export async function saveDeductionRules(input: {
  orcamentoId: string;
  items: { label: string; entityId: string | null; productId: string | null; pct: number }[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const seen = new Set<string>();
    const items: { label: string; entityId: string | null; productId: string | null; pct: number }[] = [];
    for (const i of input.items) {
      const label = i.label.trim();
      if (!label) continue;
      if (!i.entityId && !i.productId) return { error: `Escolha a estrutura ou o produto da condição de ${label}` };
      if (!Number.isFinite(i.pct) || i.pct < 0 || i.pct > 100) return { error: "Percentual deve estar entre 0 e 100" };
      const key = `${label.toLowerCase()}|${i.entityId ?? ""}|${i.productId ?? ""}`;
      if (seen.has(key)) return { error: `Há condições repetidas para ${label}` };
      seen.add(key);
      items.push({ label, entityId: i.entityId, productId: i.productId, pct: i.pct });
    }
    const supabase = await createClient();
    const hint = "Rode a migration 0024 (condições especiais) no Supabase antes de salvar.";
    const del = await supabase.from("revenue_deduction_rules").delete().eq("tenant_id", tenant.tenantId);
    if (del.error) return { error: /does not exist|schema cache|permission/i.test(del.error.message) ? hint : del.error.message };
    if (items.length > 0) {
      const ins = await supabase.from("revenue_deduction_rules").insert(
        items.map((i, idx) => ({
          tenant_id: tenant.tenantId, label: i.label, entity_node_id: i.entityId, product_node_id: i.productId, pct: i.pct, sort_order: idx,
        })),
      );
      if (ins.error) return { error: ins.error.message };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

export async function saveCurrencyRates(input: {
  orcamentoId: string;
  currency: string;
  /** 12 taxas (jan..dez); 0/vazio = não informada. */
  rates: number[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { error: "Orçamento não encontrado" };
    const currency = input.currency.trim().toUpperCase();
    if (!CURRENCY_RE.test(currency) || currency === "BRL") return { error: "Informe uma moeda de 3 letras diferente de BRL" };
    const supabase = await createClient();
    const rows = input.rates
      .map((rate, i) => ({ rate, month: i + 1 }))
      .filter((x) => Number.isFinite(x.rate) && x.rate > 0)
      .map((x) => ({
        tenant_id: tenant.tenantId,
        orcamento_id: input.orcamentoId,
        currency,
        year: orc.year,
        month: x.month,
        rate: x.rate,
      }));
    const { error: delErr } = await supabase
      .from("currency_rates")
      .delete()
      .eq("tenant_id", tenant.tenantId)
      .eq("orcamento_id", input.orcamentoId)
      .eq("year", orc.year)
      .eq("currency", currency);
    if (delErr) return { error: delErr.message };
    if (rows.length > 0) {
      const { error } = await supabase.from("currency_rates").insert(rows);
      if (error) return { error: error.message };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

const PREMISE_HINT = "Rode a migration 0027 (premissas da receita) no Supabase antes de salvar.";

export async function savePremise(input: {
  orcamentoId: string;
  id?: string | null;
  kind: "volume_growth" | "price_adjust";
  pct: number;
  fromMonth: number;
  base: "entered" | "previous_month";
  productIds: string[];
  dimensionFilters: Record<string, string[]>;
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { error: "Orçamento não encontrado" };
    if (!Number.isFinite(input.pct) || input.pct <= -100 || input.pct > 1000) return { error: "Percentual inválido" };
    if (input.fromMonth < 1 || input.fromMonth > 12) return { error: "Mês inválido" };
    const filters: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(input.dimensionFilters)) if (v.length > 0) filters[k] = Array.from(new Set(v));
    const row = {
      kind: input.kind,
      pct: input.pct,
      from_month: input.fromMonth,
      base: input.kind === "volume_growth" ? input.base : "entered",
      product_node_ids: Array.from(new Set(input.productIds)),
      dimension_filters: filters,
    };
    const supabase = await createClient();
    if (input.id) {
      const { data, error } = await supabase
        .from("revenue_premises").update(row).eq("id", input.id).eq("tenant_id", tenant.tenantId).eq("orcamento_id", input.orcamentoId).select("id");
      if (error) return { error: /does not exist|schema cache|permission/i.test(error.message) ? PREMISE_HINT : error.message };
      if (!data || data.length === 0) return { error: "Premissa não encontrada." };
    } else {
      const { error } = await supabase
        .from("revenue_premises").insert({ ...row, tenant_id: tenant.tenantId, orcamento_id: input.orcamentoId, sort_order: Date.now() % 1000000000 });
      if (error) return { error: /does not exist|schema cache|permission/i.test(error.message) ? PREMISE_HINT : error.message };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar premissa" };
  }
}

export async function setPremiseActive(input: { orcamentoId: string; id: string; active: boolean }): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("revenue_premises").update({ is_active: input.active }).eq("id", input.id).eq("tenant_id", tenant.tenantId).eq("orcamento_id", input.orcamentoId).select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Premissa não encontrada." };
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao atualizar premissa" };
  }
}

export async function deletePremise(input: { orcamentoId: string; id: string }): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("revenue_premises").delete().eq("id", input.id).eq("tenant_id", tenant.tenantId).eq("orcamento_id", input.orcamentoId).select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Premissa não encontrada." };
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao excluir premissa" };
  }
}

/**
 * Atalho de primeira vez: cria a dimensão "Produto" (se não existir) e
 * cadastra os produtos informados, tudo de uma vez. Os produtos entram
 * sob um item raiz "Produtos" (cada estrutura admite uma única raiz).
 */
export async function setupProdutos(input: { orcamentoId: string; names: string[] }): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { error: "Orçamento não encontrado" };
    const names = Array.from(new Set(input.names.map((n) => n.trim()).filter(Boolean))).slice(0, 200);
    if (names.length === 0) return { error: "Informe pelo menos um produto." };

    const supabase = await createClient();
    const findType = async () => {
      const { data } = await supabase
        .from("dimension_types")
        .select("id")
        .eq("tenant_id", tenant.tenantId)
        .eq("code", "produto")
        .maybeSingle();
      return data?.id as string | undefined;
    };

    let typeId = await findType();
    if (!typeId) {
      const r = await createDimensionType({ code: "produto", name: "Produto", description: "Produtos e serviços vendidos" });
      if (r.error) return { error: r.error };
      typeId = await findType();
      if (!typeId) return { error: "Não foi possível criar a hierarquia Produto." };
    }

    const { count } = await supabase
      .from("dimension_nodes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.tenantId)
      .eq("dimension_type_id", typeId);
    if ((count ?? 0) > 0) return { error: "Já existem produtos cadastrados. Gerencie-os na aba Produtos e serviços." };

    const root = await createDimensionNode({ dimensionTypeId: typeId, code: "PROD", name: "Produtos", parentNodeId: null, year: orc.year });
    if (root.error) return { error: root.error };
    const { data: rootNode } = await supabase
      .from("dimension_nodes")
      .select("id")
      .eq("tenant_id", tenant.tenantId)
      .eq("dimension_type_id", typeId)
      .eq("code", "PROD")
      .maybeSingle();
    if (!rootNode) return { error: "Não foi possível criar o item raiz." };

    for (let i = 0; i < names.length; i++) {
      const r = await createDimensionNode({
        dimensionTypeId: typeId,
        code: `P${String(i + 1).padStart(3, "0")}`,
        name: names[i],
        parentNodeId: rootNode.id,
        year: orc.year,
      });
      if (r.error) return { error: `Erro em "${names[i]}": ${r.error}` };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao cadastrar produtos" };
  }
}


export interface ImportProdutosInput {
  orcamentoId: string;
  productTypeId: string;
  /** Item raiz ("Produtos") e seu nível (1). Grupos novos entram abaixo dele. */
  rootId: string;
  rootLevel: number;
  groups: { code: string; name: string }[];
  creates: { code: string; name: string; parentId: string | null; parentLevel: number; groupCode?: string; kind?: "produto" | "servico" }[];
  updates: { id: string; versionId: string; validFromYear: number; name: string; parentId: string | null }[];
}

const IMPORT_LIMIT = 5000;
const CHUNK = 400;

/**
 * Importação em lote de produtos (já higienizados e classificados na tela):
 * cria grupos e produtos com poucas idas ao banco (inserts em bloco) e
 * renomeia os que casaram por código. Se algo falhar ao criar, desfaz os
 * itens criados nesta chamada.
 */
export async function importProdutos(input: ImportProdutosInput): Promise<{ created: number; updated: number; error?: string }> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { created: 0, updated: 0, error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { created: 0, updated: 0, error: "Orçamento não encontrado" };
    if (input.groups.length + input.creates.length + input.updates.length > IMPORT_LIMIT) {
      return { created: 0, updated: 0, error: `Limite de ${IMPORT_LIMIT} linhas por importação.` };
    }
    const supabase = await createClient();

    const { data: structure } = await supabase
      .from("dimension_structures")
      .select("id")
      .eq("tenant_id", tenant.tenantId)
      .eq("dimension_type_id", input.productTypeId)
      .eq("is_active", true)
      .maybeSingle();
    if (!structure) return { created: 0, updated: 0, error: "A hierarquia Produto não tem uma estrutura ativa." };

    const level = (parentLevel: number) => parentLevel + 1;
    if (input.creates.some((c) => level(c.groupCode ? input.rootLevel + 1 : c.parentLevel) > 10)) {
      return { created: 0, updated: 0, error: "Profundidade máxima de 10 níveis atingida." };
    }

    const all = [...input.groups, ...input.creates].map((r) => ({ code: r.code, name: r.name }));
    const idByCode = new Map<string, string>();
    const createdIds: string[] = [];
    const rollback = async () => {
      for (let i = 0; i < createdIds.length; i += CHUNK) {
        await supabase.from("dimension_nodes").delete().in("id", createdIds.slice(i, i + CHUNK));
      }
    };

    for (let i = 0; i < all.length; i += CHUNK) {
      const part = all.slice(i, i + CHUNK).map((r) => ({
        tenant_id: tenant.tenantId,
        dimension_type_id: input.productTypeId,
        structure_id: structure.id,
        code: r.code,
      }));
      const { data, error } = await supabase.from("dimension_nodes").insert(part).select("id, code");
      if (error) {
        await rollback();
        return {
          created: 0, updated: 0,
          error: error.code === "23505" ? "Há códigos repetidos ou já usados por outro item. Ajuste os códigos e tente de novo." : error.message,
        };
      }
      for (const row of data ?? []) { idByCode.set(row.code, row.id); createdIds.push(row.id); }
    }

    const versions = [
      ...input.groups.map((g) => ({ code: g.code, name: g.name, parent: input.rootId, level: level(input.rootLevel) })),
      ...input.creates.map((c) => ({
        code: c.code, name: c.name,
        parent: c.groupCode ? (idByCode.get(c.groupCode) ?? null) : c.parentId,
        level: c.groupCode ? level(input.rootLevel + 1) : level(c.parentLevel),
      })),
    ];
    for (let i = 0; i < versions.length; i += CHUNK) {
      const part = versions.slice(i, i + CHUNK).map((v) => ({
        dimension_node_id: idByCode.get(v.code)!,
        parent_node_id: v.parent,
        name: v.name,
        level: v.level,
        valid_from_year: orc.year,
        valid_until_year: null,
      }));
      const { error } = await supabase.from("dimension_node_versions").insert(part);
      if (error) {
        await rollback();
        return { created: 0, updated: 0, error: error.message };
      }
    }

    // Serviços: só eles ganham linha (ausência = produto).
    const services = input.creates.filter((c) => c.kind === "servico" && idByCode.has(c.code));
    for (let i = 0; i < services.length; i += CHUNK) {
      const { error } = await supabase.from("revenue_item_kinds").insert(
        services.slice(i, i + CHUNK).map((c) => ({ tenant_id: tenant.tenantId, dimension_node_id: idByCode.get(c.code)!, kind: "servico" }))
      );
      if (error) {
        await rollback();
        return { created: 0, updated: 0, error: `Não consegui gravar o tipo dos serviços (${error.message}). Rode a migração 0021.` };
      }
    }

    let updated = 0;
    for (let i = 0; i < input.updates.length; i += 20) {
      const results = await Promise.all(
        input.updates.slice(i, i + 20).map((u) =>
          updateDimensionNode({ nodeId: u.id, versionId: u.versionId, currentValidFromYear: u.validFromYear, name: u.name, parentNodeId: u.parentId, year: orc.year })
        )
      );
      updated += results.filter((r) => r.success).length;
      const failed = results.find((r) => r.error);
      if (failed) return { created: createdIds.length, updated, error: failed.error };
    }

    refresh(input.orcamentoId);
    revalidatePath("/admin/configuracoes");
    return { created: input.creates.length + input.groups.length, updated };
  } catch (e) {
    return { created: 0, updated: 0, error: e instanceof Error ? e.message : "Erro ao importar produtos" };
  }
}


/** Define se um item é produto ou serviço. */
export async function setItemKind(input: { orcamentoId: string; nodeId: string; kind: "produto" | "servico" }): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const orc = await assertOrcamento(tenant.tenantId, input.orcamentoId);
    if (!orc) return { error: "Orçamento não encontrado" };
    const supabase = await createClient();
    if (input.kind === "produto") {
      const { error } = await supabase
        .from("revenue_item_kinds")
        .delete()
        .eq("tenant_id", tenant.tenantId)
        .eq("dimension_node_id", input.nodeId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from("revenue_item_kinds")
        .upsert({ tenant_id: tenant.tenantId, dimension_node_id: input.nodeId, kind: "servico" }, { onConflict: "tenant_id,dimension_node_id" });
      if (error) return { error: error.message };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar o tipo" };
  }
}
