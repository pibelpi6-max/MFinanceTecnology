"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";

interface ActionResult {
  success?: true;
  error?: string;
}

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

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
  // O layout do /admin carrega a lista de dimensões para a sidebar;
  // "layout" propaga a revalidação para todas as páginas aninhadas.
  revalidatePath("/admin", "layout");
}

export async function updateFiscalYearStartMonth(month: number): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { error: "Mês inválido." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("tenants")
      .update({ fiscal_year_start_month: month })
      .eq("id", tenant.tenantId);
    if (error) return { error: error.message };

    afterMutation();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function createDimensionType(input: {
  code: string;
  name: string;
  description: string | null;
}): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const code = input.code.trim().toLowerCase();
    const name = input.name.trim();
    if (!CODE_PATTERN.test(code)) {
      return { error: "Código deve começar com letra e conter só letras minúsculas, números e _." };
    }
    if (!name) return { error: "Informe um nome." };

    const supabase = await createClient();

    const { count, error: countError } = await supabase
      .from("dimension_types")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.tenantId)
      .eq("is_system", false);
    if (countError) return { error: countError.message };
    if ((count ?? 0) >= 10) {
      return { error: "Limite de 10 dimensões personalizadas por empresa atingido." };
    }

    const { data: last } = await supabase
      .from("dimension_types")
      .select("sort_order")
      .eq("tenant_id", tenant.tenantId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("dimension_types").insert({
      tenant_id: tenant.tenantId,
      code,
      name,
      description: input.description?.trim() || null,
      is_system: false,
      sort_order: (last?.sort_order ?? 0) + 1,
    });
    if (error) {
      if (error.code === "23505") return { error: "Já existe uma dimensão com esse código." };
      return { error: error.message };
    }

    afterMutation();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function updateDimensionType(input: {
  id: string;
  name: string;
  description: string | null;
}): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const name = input.name.trim();
    if (!name) return { error: "Informe um nome." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("dimension_types")
      .update({ name, description: input.description?.trim() || null })
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) return { error: error.message };

    afterMutation();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}
