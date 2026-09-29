"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getPackageStatusHistory } from "@/lib/packages/queries";
import type { PackageStatus, PackageStatusHistoryRow } from "@/lib/packages/types";

interface ActionResult {
  success?: true;
  error?: string;
}

const EDITABLE_STATUSES: PackageStatus[] = ["rascunho", "em_elaboracao", "rejeitado"];

// Estados seguintes permitidos a partir de cada estado (workflow de aprovação).
const ALLOWED_TRANSITIONS: Record<PackageStatus, PackageStatus[]> = {
  rascunho: ["em_elaboracao"],
  em_elaboracao: ["submetido"],
  submetido: ["aprovado", "rejeitado"],
  rejeitado: ["em_elaboracao"],
  aprovado: [],
};

// Transições para aprovado/rejeitado exigem papel de aprovador (ou admin).
const APPROVER_ONLY_TARGETS: PackageStatus[] = ["aprovado", "rejeitado"];

async function requireWriteAccess() {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  if (tenant.role === "leitor") throw new Error("Seu perfil não tem permissão para alterar pacotes.");
  return tenant;
}

export async function createPackage(input: {
  year: number;
  name: string;
  costCenterNodeId: string | null;
  entityNodeId: string | null;
}): Promise<ActionResult> {
  try {
    const tenant = await requireWriteAccess();
    const supabase = await createClient();

    const { data: pkg, error } = await supabase
      .from("budget_packages")
      .insert({
        tenant_id: tenant.tenantId,
        year: input.year,
        name: input.name,
        cost_center_node_id: input.costCenterNodeId,
        entity_node_id: input.entityNodeId,
        owner_user_id: tenant.userId,
        status: "rascunho",
      })
      .select("id")
      .single();
    if (error) return { error: error.message };

    await supabase.from("budget_package_status_history").insert({
      package_id: pkg.id,
      from_status: null,
      to_status: "rascunho",
      changed_by: tenant.userId,
    });

    revalidatePath("/admin/pacotes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function updatePackage(input: {
  id: string;
  currentStatus: PackageStatus;
  name: string;
  costCenterNodeId: string | null;
  entityNodeId: string | null;
}): Promise<ActionResult> {
  try {
    await requireWriteAccess();
    if (!EDITABLE_STATUSES.includes(input.currentStatus)) {
      return { error: "Este pacote não pode ser editado no status atual." };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("budget_packages")
      .update({
        name: input.name,
        cost_center_node_id: input.costCenterNodeId,
        entity_node_id: input.entityNodeId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);
    if (error) return { error: error.message };

    revalidatePath("/admin/pacotes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function deletePackage(input: { id: string; entriesCount: number; status: PackageStatus }): Promise<ActionResult> {
  try {
    await requireWriteAccess();
    if (input.status !== "rascunho") {
      return { error: "Só é possível excluir pacotes em rascunho." };
    }
    if (input.entriesCount > 0) {
      return { error: "Este pacote já tem lançamentos associados na Matriz — não pode ser excluído." };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("budget_packages").delete().eq("id", input.id);
    if (error) return { error: error.message };

    revalidatePath("/admin/pacotes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function transitionPackageStatus(input: {
  id: string;
  fromStatus: PackageStatus;
  toStatus: PackageStatus;
  comment?: string;
}): Promise<ActionResult> {
  try {
    const tenant = await requireWriteAccess();

    const allowed = ALLOWED_TRANSITIONS[input.fromStatus] ?? [];
    if (!allowed.includes(input.toStatus)) {
      return { error: "Transição de status não permitida." };
    }
    if (APPROVER_ONLY_TARGETS.includes(input.toStatus) && tenant.role !== "aprovador" && tenant.role !== "admin") {
      return { error: "Só um aprovador pode aprovar ou rejeitar este pacote." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("budget_packages")
      .update({ status: input.toStatus, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .eq("status", input.fromStatus); // evita corrida: só aplica se o status ainda é o esperado
    if (error) return { error: error.message };

    await supabase.from("budget_package_status_history").insert({
      package_id: input.id,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      comment: input.comment || null,
      changed_by: tenant.userId,
    });

    revalidatePath("/admin/pacotes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function fetchPackageHistory(packageId: string): Promise<{ data?: PackageStatusHistoryRow[]; error?: string }> {
  try {
    await getCurrentTenant();
    const data = await getPackageStatusHistory(packageId);
    return { data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}
