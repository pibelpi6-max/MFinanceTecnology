import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { buildDimensionHierarchy } from "@/lib/dimensions/hierarchy";
import { getExpenseEntries } from "@/lib/actuals/queries";
import { RealizadoFilters } from "./RealizadoFilters";
import { RealizadoClient } from "./RealizadoClient";

interface PageProps {
  searchParams: { ano?: string; mes?: string; entidade?: string };
}

export default async function RealizadoPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const t = await getTranslations("actuals");

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
  const { rows: entityRows } = buildDimensionHierarchy(entityNodes);

  const requestedEntity = searchParams.entidade;
  const entityNodeId =
    requestedEntity && entityNodes.some((n) => n.id === requestedEntity) ? requestedEntity : entityRows[0]?.item.id;

  const missingSetup = accountRows.length === 0 || costCenterNodes.length === 0 || entityRows.length === 0;

  const entries = !missingSetup && entityNodeId ? await getExpenseEntries(tenant.tenantId, year, month, entityNodeId) : [];

  return (
    <>
      <div className="admin-subheader">
        <div>
          <p className="admin-page-crumb">{tenant.tenantName}</p>
          <h1 className="admin-page-title">{t("title")}</h1>
        </div>
        <div className="admin-page-actions">
          {!missingSetup && (
            <RealizadoFilters
              year={year}
              month={month}
              entityNodeId={entityNodeId ?? ""}
              entities={entityRows.map((r) => ({ id: r.item.id, name: r.item.name }))}
            />
          )}
        </div>
      </div>
      <div className="admin-content">
        <div className="admin-table-card">
          {missingSetup ? (
            <div className="matrix-empty-state">
              <p>{t("missingSetup")}</p>
            </div>
          ) : (
            <RealizadoClient
              year={year}
              month={month}
              entityNodeId={entityNodeId!}
              accounts={accountRows.map((r) => r.item)}
              costCenters={costCenterNodes}
              initialEntries={entries}
            />
          )}
        </div>
      </div>
    </>
  );
}
