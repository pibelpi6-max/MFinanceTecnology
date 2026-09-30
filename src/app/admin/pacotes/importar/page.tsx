import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { getTenantLabels } from "@/lib/labels/getTenantLabels";
import { ImportPacotesClient } from "./ImportPacotesClient";

interface PageProps {
  searchParams: { ano?: string };
}

export default async function ImportarPacotesPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const year = Number(searchParams.ano) || new Date().getFullYear();
  const locale = await getLocale();
  const labels = await getTenantLabels(tenant.tenantId, locale);

  const [centroCustoType, entidadeType] = await Promise.all([
    getDimensionTypeByCode(tenant.tenantId, "centro_custo"),
    getDimensionTypeByCode(tenant.tenantId, "entidade"),
  ]);
  const [costCenterNodes, entityNodes] = await Promise.all([
    centroCustoType ? getDimensionTree(tenant.tenantId, centroCustoType.id, year) : Promise.resolve([]),
    entidadeType ? getDimensionTree(tenant.tenantId, entidadeType.id, year) : Promise.resolve([]),
  ]);

  const t = await getTranslations("import");

  return (
    <>
      <div className="admin-subheader">
        <div>
          <p className="admin-page-crumb">{tenant.tenantName}</p>
          <h1 className="admin-page-title">
            {t("titlePrefix")} {labels.budgetPackagePlural}
          </h1>
        </div>
      </div>
      <div className="admin-content admin-content--scroll">
        <div className="admin-table-card">
          <ImportPacotesClient
            year={year}
            packageLabelPlural={labels.budgetPackagePlural}
            costCenterNodes={costCenterNodes.map((n) => ({ id: n.id, code: n.code, name: n.name }))}
            entityNodes={entityNodes.map((n) => ({ id: n.id, code: n.code, name: n.name }))}
          />
        </div>
      </div>
    </>
  );
}
