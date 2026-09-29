import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { getPackages } from "@/lib/packages/queries";
import { getTenantLabels } from "@/lib/labels/getTenantLabels";
import { PackagesClient } from "./PackagesClient";

interface PageProps {
  searchParams: { ano?: string };
}

export default async function PacotesPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const locale = await getLocale();
  const labels = await getTenantLabels(tenant.tenantId, locale);

  const year = Number(searchParams.ano) || new Date().getFullYear();

  const [centroCustoType, entidadeType] = await Promise.all([
    getDimensionTypeByCode(tenant.tenantId, "centro_custo"),
    getDimensionTypeByCode(tenant.tenantId, "entidade"),
  ]);
  const [costCenterNodes, entityNodes] = await Promise.all([
    centroCustoType ? getDimensionTree(tenant.tenantId, centroCustoType.id, year) : Promise.resolve([]),
    entidadeType ? getDimensionTree(tenant.tenantId, entidadeType.id, year) : Promise.resolve([]),
  ]);

  const packages = await getPackages(tenant.tenantId, year);

  return (
    <>
      <div className="admin-subheader">
        <div>
          <p className="admin-page-crumb">{tenant.tenantName}</p>
          <h1 className="admin-page-title">{labels.budgetPackagePlural}</h1>
        </div>
      </div>
      <div className="admin-content">
        <div className="admin-table-card">
          <PackagesClient
            year={year}
            packages={packages}
            costCenterNodes={costCenterNodes.map((n) => ({ id: n.id, name: n.name }))}
            entityNodes={entityNodes.map((n) => ({ id: n.id, name: n.name }))}
            packageLabel={labels.budgetPackage}
            role={tenant.role}
            currentUserId={tenant.userId}
          />
        </div>
      </div>
    </>
  );
}
