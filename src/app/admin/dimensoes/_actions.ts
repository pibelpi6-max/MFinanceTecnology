"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";

interface ActionResult {
  success?: true;
  error?: string;
}

async function requireTenant() {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  return tenant;
}

function computeLevel(parent: { level: number } | null): number {
  return parent ? parent.level + 1 : 1;
}

export async function createDimensionNode(input: {
  dimensionTypeId: string;
  code: string;
  name: string;
  parentNodeId: string | null;
  year: number;
}): Promise<ActionResult> {
  try {
    const { tenantId } = await requireTenant();
    const supabase = await createClient();

    let level = 1;
    if (input.parentNodeId) {
      const { data: parentVersion } = await supabase
        .from("dimension_node_versions")
        .select("level")
        .eq("dimension_node_id", input.parentNodeId)
        .lte("valid_from_year", input.year)
        .or(`valid_until_year.is.null,valid_until_year.gte.${input.year}`)
        .maybeSingle();
      level = computeLevel(parentVersion);
    }
    if (level > 10) return { error: "Profundidade máxima de 10 níveis atingida." };

    const { data: node, error: nodeError } = await supabase
      .from("dimension_nodes")
      .insert({
        tenant_id: tenantId,
        dimension_type_id: input.dimensionTypeId,
        code: input.code,
      })
      .select("id")
      .single();
    if (nodeError) return { error: nodeError.message };

    const { error: versionError } = await supabase
      .from("dimension_node_versions")
      .insert({
        dimension_node_id: node.id,
        parent_node_id: input.parentNodeId,
        name: input.name,
        level,
        valid_from_year: input.year,
        valid_until_year: null,
      });
    if (versionError) return { error: versionError.message };

    revalidatePath("/admin/dimensoes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function updateDimensionNode(input: {
  nodeId: string;
  versionId: string;
  currentValidFromYear: number;
  name: string;
  parentNodeId: string | null;
  year: number;
}): Promise<ActionResult> {
  try {
    await requireTenant();
    const supabase = await createClient();

    let level = 1;
    if (input.parentNodeId) {
      const { data: parentVersion } = await supabase
        .from("dimension_node_versions")
        .select("level")
        .eq("dimension_node_id", input.parentNodeId)
        .lte("valid_from_year", input.year)
        .or(`valid_until_year.is.null,valid_until_year.gte.${input.year}`)
        .maybeSingle();
      level = computeLevel(parentVersion);
    }
    if (level > 10) return { error: "Profundidade máxima de 10 níveis atingida." };

    if (input.currentValidFromYear === input.year) {
      const { error } = await supabase
        .from("dimension_node_versions")
        .update({ name: input.name, parent_node_id: input.parentNodeId, level })
        .eq("id", input.versionId);
      if (error) return { error: error.message };
    } else {
      const { error: closeError } = await supabase
        .from("dimension_node_versions")
        .update({ valid_until_year: input.year - 1 })
        .eq("id", input.versionId);
      if (closeError) return { error: closeError.message };

      const { error: insertError } = await supabase
        .from("dimension_node_versions")
        .insert({
          dimension_node_id: input.nodeId,
          parent_node_id: input.parentNodeId,
          name: input.name,
          level,
          valid_from_year: input.year,
          valid_until_year: null,
        });
      if (insertError) return { error: insertError.message };
    }

    revalidatePath("/admin/dimensoes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function importDimensionNodes(input: {
  dimensionTypeId: string;
  year: number;
  rows: { values: Record<string, string> }[];
}): Promise<{ successCount: number; errorCount: number; errors: { rowIndex: number; message: string }[] }> {
  const { tenantId } = await requireTenant();
  const supabase = await createClient();

  const errors: { rowIndex: number; message: string }[] = [];
  let successCount = 0;

  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex++) {
    const values = input.rows[rowIndex].values;
    const code = (values.codigo ?? "").trim();
    const name = (values.nome ?? "").trim();
    const parentNodeId = values.item_superior || null;

    if (!code || !name) {
      errors.push({ rowIndex, message: "Código e nome são obrigatórios." });
      continue;
    }

    let level = 1;
    if (parentNodeId) {
      const { data: parentVersion } = await supabase
        .from("dimension_node_versions")
        .select("level")
        .eq("dimension_node_id", parentNodeId)
        .lte("valid_from_year", input.year)
        .or(`valid_until_year.is.null,valid_until_year.gte.${input.year}`)
        .maybeSingle();
      level = computeLevel(parentVersion);
    }
    if (level > 10) {
      errors.push({ rowIndex, message: "Profundidade máxima de 10 níveis atingida." });
      continue;
    }

    const { data: node, error: nodeError } = await supabase
      .from("dimension_nodes")
      .insert({ tenant_id: tenantId, dimension_type_id: input.dimensionTypeId, code })
      .select("id")
      .single();
    if (nodeError) {
      const message =
        nodeError.code === "23505" ? `Já existe um item com o código "${code}".` : nodeError.message;
      errors.push({ rowIndex, message });
      continue;
    }

    const { error: versionError } = await supabase.from("dimension_node_versions").insert({
      dimension_node_id: node.id,
      parent_node_id: parentNodeId,
      name,
      level,
      valid_from_year: input.year,
      valid_until_year: null,
    });
    if (versionError) {
      errors.push({ rowIndex, message: versionError.message });
      continue;
    }

    successCount++;
  }

  if (successCount > 0) revalidatePath("/admin/dimensoes");
  return { successCount, errorCount: errors.length, errors };
}

export async function cancelDimensionNode(input: {
  versionId: string;
  year: number;
}): Promise<ActionResult> {
  try {
    await requireTenant();
    const supabase = await createClient();
    const { error } = await supabase
      .from("dimension_node_versions")
      .update({ valid_until_year: input.year - 1 })
      .eq("id", input.versionId);
    if (error) return { error: error.message };

    revalidatePath("/admin/dimensoes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}
