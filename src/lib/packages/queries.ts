import { createClient } from "@/lib/supabase/server";
import type { BudgetPackageRow, PackageStatusHistoryRow } from "./types";

export async function getPackages(tenantId: string, year: number): Promise<BudgetPackageRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("budget_packages")
    .select(
      `id, year, name, cost_center_node_id, owner_user_id, status, created_at, updated_at,
       dimension_nodes:cost_center_node_id (
         dimension_node_versions!dimension_node_id!inner ( name )
       )`
    )
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const { data: counts } = await supabase
    .from("matrix_budget_entries")
    .select("package_id")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .not("package_id", "is", null);

  const countByPackage = new Map<string, number>();
  for (const row of counts ?? []) {
    if (!row.package_id) continue;
    countByPackage.set(row.package_id, (countByPackage.get(row.package_id) ?? 0) + 1);
  }

  return (data ?? []).map((row) => {
    const nodeRel = row.dimension_nodes as unknown as
      | { dimension_node_versions?: { name: string }[] | { name: string } }
      | null;
    let costCenterName: string | null = null;
    if (nodeRel?.dimension_node_versions) {
      const v = Array.isArray(nodeRel.dimension_node_versions)
        ? nodeRel.dimension_node_versions[0]
        : nodeRel.dimension_node_versions;
      costCenterName = v?.name ?? null;
    }
    return {
      id: row.id,
      year: row.year,
      name: row.name,
      costCenterNodeId: row.cost_center_node_id,
      costCenterName,
      status: row.status,
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      entriesCount: countByPackage.get(row.id) ?? 0,
    };
  });
}

export async function getPackageStatusHistory(packageId: string): Promise<PackageStatusHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_package_status_history")
    .select("id, from_status, to_status, comment, changed_by, created_at")
    .eq("package_id", packageId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    comment: row.comment,
    changedByUserId: row.changed_by,
    createdAt: row.created_at,
  }));
}
