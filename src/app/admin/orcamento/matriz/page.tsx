import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { buildDimensionHierarchy } from "@/lib/dimensions/hierarchy";
import { getMatrixEntries } from "@/lib/budget/queries";
import { getPackages } from "@/lib/packages/queries";
import { getTenantLabels } from "@/lib/labels/getTenantLabels";
import { MatrixFilters } from "./MatrixFilters";
import { MatrixGridClient } from "./MatrixGridClient";
import { MatrixEntityPackageTree } from "./MatrixEntityPackageTree";

interface PageProps {
  searchParams: { ano?: string; mes?: string; entidade?: string };
}

export default async function MatrizPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const t = await getTranslations("budget");
  const locale = await getLocale();
  const labels = await getTenantLabels(tenant.tenantId, locale);

  const [contaType, centroCustoType, entidadeType] = await Promise.all([
    getDimensionTypeByCode(tenant.tenantId, "conta"),
    getDimensionTypeByCode(tenant.tenantId, "centro_custo"),
    getDimensionTypeByCode(tenant.tenantId, "entidade"),
  ]);

  const year = Number(searchParams.ano) || new Date().getFullYear();
  const month = Number(searchParams.mes) || new Date().getMonth() + 1;

  const [accountNodes, costCenterNodes, entityNodes] = await Promise.all([
    contaType ? getDimensionTree(tenant.tenantId, contaType.id, year) : Promise.resolve([]),
    centroCustoType ? getDimensionTree(tenant.tenantId, centroCustoType.id, year) : Promise.resolve([]),
    entidadeType ? getDimensionTree(tenant.tenantId, entidadeType.id, year) : Promise.resolve([]),
  ]);

  const { rows: accountRows } = buildDimensionHierarchy(accountNodes);
  const { rows: costCenterRows } = buildDimensionHierarchy(costCenterNodes);
  const { rows: entityRows } = buildDimensionHierarchy(entityNodes);

  const requestedEntity = searchParams.entidade;
  const entityNodeId =
    requestedEntity && entityNodes.some((n) => n.id === requestedEntity)
      ? requestedEntity
      : entityRows[0]?.item.id;

  const missingSetup = accountRows.length === 0 || costCenterRows.length === 0 || entityRows.length === 0;

  const [entries, packages] = await Promise.all([
    !missingSetup && entityNodeId ? getMatrixEntries(tenant.tenantId, year, month, entityNodeId) : Promise.resolve([]),
    getPackages(tenant.tenantId, year),
  ]);

  return (
    <>
      <div className="admin-subheader">
        <div>
          <p className="admin-page-crumb">{tenant.tenantName}</p>
          <h1 className="admin-page-title">{t("title")}</h1>
        </div>
        <div className="admin-page-actions">
          {!missingSetup && (
            <MatrixFilters
              year={year}
              month={month}
              entityNodeId={entityNodeId ?? ""}
              entities={entityRows.map((r) => ({ id: r.item.id, name: r.item.name }))}
            />
          )}
        </div>
      </div>
      <div className="admin-content">
        <div className="matrix-layout">
          {!missingSetup && (
            <MatrixEntityPackageTree
              year={year}
              month={month}
              entityRows={entityRows}
              selectedEntityId={entityNodeId ?? ""}
              packages={packages}
              packageLabelPlural={labels.budgetPackagePlural}
            />
          )}
          <div className="admin-table-card">
            {missingSetup ? (
              <div className="matrix-empty-state">
                <p>{t("missingSetup")}</p>
              </div>
            ) : (
              <MatrixGridClient
                year={year}
                month={month}
                entityNodeId={entityNodeId!}
                accounts={accountRows}
                costCenters={costCenterRows.map((r) => r.item)}
                initialEntries={entries}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
