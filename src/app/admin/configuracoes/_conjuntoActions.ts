"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";

interface ActionResult {
  success?: true;
  id?: string;
  error?: string;
}

async function requireAdmin() {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  if (tenant.role !== "admin") {
    throw new Error("Apenas administradores podem alterar parâmetros do sistema.");
  }
  return tenant;
}

function afterMutation() {
  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin", "layout");
}

export interface ConjuntoItemInput {
  dimensionTypeId: string;
  structureId: string;
}

/**
 * Substitui por completo os itens (1 Estrutura por tipo de dimensão) de
 * um Conjunto já existente — apaga os antigos e insere os novos. Usado
 * tanto por createConjunto (conjunto recém-criado, sem itens ainda)
 * quanto por updateConjunto.
 */
async function replaceConjuntoItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conjuntoId: string,
  items: ConjuntoItemInput[]
): Promise<{ error?: string }> {
  const { error: deleteError } = await supabase
    .from("conjunto_estrutura_items")
    .delete()
    .eq("conjunto_id", conjuntoId);
  if (deleteError) return { error: deleteError.message };

  if (items.length === 0) return {};

  const { error: insertError } = await supabase.from("conjunto_estrutura_items").insert(
    items.map((it) => ({
      conjunto_id: conjuntoId,
      dimension_type_id: it.dimensionTypeId,
      structure_id: it.structureId,
    }))
  );
  if (insertError) return { error: insertError.message };
  return {};
}

export async function createConjunto(input: { name: string; items: ConjuntoItemInput[] }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const name = input.name.trim();
    if (!name) return { error: "Informe um nome." };

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("conjuntos_estrutura")
      .insert({ tenant_id: tenant.tenantId, name })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { error: "Já existe um conjunto com esse nome." };
      return { error: error.message };
    }

    const itemsResult = await replaceConjuntoItems(supabase, created.id, input.items);
    if (itemsResult.error) return { error: itemsResult.error };

    afterMutation();
    return { success: true, id: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function updateConjunto(input: {
  id: string;
  name: string;
  items: ConjuntoItemInput[];
}): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const name = input.name.trim();
    if (!name) return { error: "Informe um nome." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("conjuntos_estrutura")
      .update({ name })
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) {
      if (error.code === "23505") return { error: "Já existe um conjunto com esse nome." };
      return { error: error.message };
    }

    const itemsResult = await replaceConjuntoItems(supabase, input.id, input.items);
    if (itemsResult.error) return { error: itemsResult.error };

    afterMutation();
    return { success: true, id: input.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function deleteConjunto(input: { id: string }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const supabase = await createClient();

    const { count, error: countError } = await supabase
      .from("orcamentos")
      .select("id", { count: "exact", head: true })
      .eq("conjunto_estrutura_id", input.id);
    if (countError) return { error: countError.message };
    if ((count ?? 0) > 0) {
      return { error: "Este conjunto está em uso por um ou mais Orçamentos. Troque o conjunto deles antes de excluir." };
    }

    const { error } = await supabase
      .from("conjuntos_estrutura")
      .delete()
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) return { error: error.message };

    afterMutation();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}
