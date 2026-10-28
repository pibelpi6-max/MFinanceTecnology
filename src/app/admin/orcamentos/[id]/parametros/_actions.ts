"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";

type Result = { success?: true; error?: string };

const HINT = "Rode a migration 0031 (moedas) no Supabase antes de salvar.";
const hintOr = (m: string) => (/does not exist|schema cache|permission/i.test(m) ? HINT : m);

export async function saveTenantCurrency(input: { orcamentoId: string; code: string; name: string }): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) return { error: "Use o código de 3 letras da moeda (ex.: USD)" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("tenant_currencies")
      .upsert({ tenant_id: tenant.tenantId, code, name: input.name.trim() }, { onConflict: "tenant_id,code" });
    if (error) return { error: hintOr(error.message) };
    revalidatePath(`/admin/orcamentos/${input.orcamentoId}`, "layout");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
}

export async function deleteTenantCurrency(input: { orcamentoId: string; code: string }): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const supabase = await createClient();
    const { error } = await supabase.from("tenant_currencies").delete().eq("tenant_id", tenant.tenantId).eq("code", input.code);
    if (error) return { error: hintOr(error.message) };
    revalidatePath(`/admin/orcamentos/${input.orcamentoId}`, "layout");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao excluir" };
  }
}
