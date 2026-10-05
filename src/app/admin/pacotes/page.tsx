import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import { getPackages } from "@/lib/packages/queries";
import { getTenantLabels } from "@/lib/labels/getTenantLabels";
import { ImportLinkButton } from "@/components/import/ImportLinkButton";
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
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.CENTRO_CUSTO),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.ENTIDADE),
  ]);
  const [costCenterNodes, entityNodes] = await Promise.all([
    centroCustoType ? getDimensionTree(tenant.tenantId, centroCustoType.id, year) : Promise.resolve([]),
    entidadeType ? getDimensionTree(tenant.tenantId, entidadeType.id, year) : Promise.resolve([]),
  ]);

  const packages = await getPackages(tenant.tenantId, year);
  const t = await getTranslations("packages");

  return (
    <>
      <div className="admin-subheader">
        <div>
          <h1 className="admin-page-title">{labels.budgetPackagePlural}</h1>
        </div>
        <div className="admin-page-actions">
          <ImportLinkButton href={`/admin/pacotes/importar?ano=${year}`} label={t("importButton")} />
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
