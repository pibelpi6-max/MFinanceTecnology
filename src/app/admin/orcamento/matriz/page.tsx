import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import { buildDimensionHierarchy } from "@/lib/dimensions/hierarchy";
import { getMatrixEntries } from "@/lib/budget/queries";
import { getPackages } from "@/lib/packages/queries";
import { getTenantLabels } from "@/lib/labels/getTenantLabels";
import { getTenantSettings } from "@/lib/settings/queries";
import { getModuleDimensionTypes } from "@/lib/modules/queries";
import { ImportLinkButton } from "@/components/import/ImportLinkButton";
import { MatrixFilters } from "./MatrixFilters";
import { MatrixGridClient } from "./MatrixGridClient";
import { MatrixEntityPackageTree } from "./MatrixEntityPackageTree";

interface PageProps {
  // Além de ano/mes/entidade, cada dimensão extra marcada no módulo da
  // Matriz (ver Parâmetros) ganha sua própria chave dinâmica aqui,
  // nomeada pelo código da dimensão (ex: "projeto").
  searchParams: { ano?: string; mes?: string; entidade?: string; [key: string]: string | undefined };
}

export default async function MatrizPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const t = await getTranslations("budget");
  const locale = await getLocale();
  const labels = await getTenantLabels(tenant.tenantId, locale);

  const [contaType, centroCustoType, entidadeType, settings] = await Promise.all([
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.CONTA),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.CENTRO_CUSTO),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.ENTIDADE),
    getTenantSettings(tenant.tenantId),
  ]);

  const year = Number(searchParams.ano) || new Date().getFullYear();
  const month = Number(searchParams.mes) || new Date().getMonth() + 1;

  const extraDimensionTypes = await getModuleDimensionTypes(tenant.tenantId, settings.matrizModuleId);

  const [accountNodes, costCenterNodes, entityNodes, extraDimensionTrees] = await Promise.all([
    contaType ? getDimensionTree(tenant.tenantId, contaType.id, year) : Promise.resolve([]),
    centroCustoType ? getDimensionTree(tenant.tenantId, centroCustoType.id, year) : Promise.resolve([]),
    entidadeType ? getDimensionTree(tenant.tenantId, entidadeType.id, year) : Promise.resolve([]),
    Promise.all(extraDimensionTypes.map((dt) => getDimensionTree(tenant.tenantId, dt.id, year))),
  ]);

  const { rows: accountRows } = buildDimensionHierarchy(accountNodes);
  const { rows: costCenterRows } = buildDimensionHierarchy(costCenterNodes);
  const { rows: entityRows } = buildDimensionHierarchy(entityNodes);

  const requestedEntity = searchParams.entidade;
  const entityNodeId =
    requestedEntity && entityNodes.some((n) => n.id === requestedEntity)
      ? requestedEntity
      : entityRows[0]?.item.id;

  // Só entram como eixo extra de fato as dimensões que já têm pelo menos
  // um item cadastrado (ver Dimensões) — sem isso não haveria o que
  // selecionar, então a dimensão fica "marcada no módulo" mas ainda
  // inerte na Matriz até a usuária cadastrar itens nela.
  const activeExtraDimensions = extraDimensionTypes
    .map((dimensionType, i) => ({ dimensionType, rows: buildDimensionHierarchy(extraDimensionTrees[i]).rows }))
    .filter((d) => d.rows.length > 0);

  const extraSelections = activeExtraDimensions.map(({ dimensionType, rows }) => {
    const requested = searchParams[dimensionType.code];
    const nodeId = requested && rows.some((r) => r.item.id === requested) ? requested : rows[0].item.id;
    return {
      dimensionTypeId: dimensionType.id,
      code: dimensionType.code,
      name: dimensionType.name,
      nodeId,
      options: rows.map((r) => ({ id: r.item.id, name: r.item.name })),
    };
  });

  const extraDimensionsFilter: Record<string, string> = {};
  for (const sel of extraSelections) extraDimensionsFilter[sel.dimensionTypeId] = sel.nodeId;

  const missingSetup = accountRows.length === 0 || costCenterRows.length === 0 || entityRows.length === 0;

  const [entries, packages] = await Promise.all([
    !missingSetup && entityNodeId
      ? getMatrixEntries(tenant.tenantId, year, month, entityNodeId, extraDimensionsFilter)
      : Promise.resolve([]),
    getPackages(tenant.tenantId, year),
  ]);

  return (
    <>
      <div className="admin-subheader">
        <div>
          <h1 className="admin-page-title">{t("title")}</h1>
        </div>
        <div className="admin-page-actions">
          {!missingSetup && (
            <MatrixFilters
              year={year}
              month={month}
              entityNodeId={entityNodeId ?? ""}
              entities={entityRows.map((r) => ({ id: r.item.id, name: r.item.name }))}
              extraSelections={extraSelections.map(({ code, name, nodeId, options }) => ({ code, name, nodeId, options }))}
            />
          )}
          <ImportLinkButton href={`/admin/orcamento/matriz/importar?ano=${year}`} label={t("importButton")} />
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
                extraDimensions={extraDimensionsFilter}
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
