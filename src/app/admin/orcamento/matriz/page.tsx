import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree, getMatrizExtraDimensionTypes } from "@/lib/dimensions/queries";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import { buildDimensionHierarchy } from "@/lib/dimensions/hierarchy";
import { getMatrixEntries, type PackageScope } from "@/lib/budget/queries";
import { getPackages } from "@/lib/packages/queries";
import { getTenantLabels } from "@/lib/labels/getTenantLabels";
import { getOrcamentoContext } from "@/lib/orcamentos/queries";
import { BackToMapLink } from "@/components/orcamentos/BackToMapLink";
import { ImportLinkButton } from "@/components/import/ImportLinkButton";
import { MatrixFilters } from "./MatrixFilters";
import { MatrixGridClient } from "./MatrixGridClient";
import { MatrixEntityPackageTree } from "./MatrixEntityPackageTree";

interface PageProps {
  // Além de ano/mes/entidade, cada dimensão marcada com "Usar na Matriz
  // Orçamentária" (ver Parâmetros > Dimensões) ganha sua própria chave
  // dinâmica aqui, nomeada pelo código da dimensão (ex: "projeto").
  searchParams: { ano?: string; mes?: string; entidade?: string; pacote?: string; [key: string]: string | undefined };
}

export default async function MatrizPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const t = await getTranslations("budget");
  const tOrc = await getTranslations("orcamentos");
  const locale = await getLocale();
  const [labels, orcamentoCtx] = await Promise.all([
    getTenantLabels(tenant.tenantId, locale),
    getOrcamentoContext(tenant.tenantId),
  ]);
  const { orcamentoId, conjuntoEstruturaId } = orcamentoCtx;

  const [contaType, centroCustoType, entidadeType, extraDimensionTypes] = await Promise.all([
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.CONTA),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.CENTRO_CUSTO),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.ENTIDADE),
    getMatrizExtraDimensionTypes(tenant.tenantId),
  ]);

  const year = Number(searchParams.ano) || new Date().getFullYear();
  const month = Number(searchParams.mes) || new Date().getMonth() + 1;

  const [accountNodes, costCenterNodes, entityNodes, extraDimensionTrees] = await Promise.all([
    contaType ? getDimensionTree(tenant.tenantId, contaType.id, year, conjuntoEstruturaId) : Promise.resolve([]),
    centroCustoType
      ? getDimensionTree(tenant.tenantId, centroCustoType.id, year, conjuntoEstruturaId)
      : Promise.resolve([]),
    entidadeType ? getDimensionTree(tenant.tenantId, entidadeType.id, year, conjuntoEstruturaId) : Promise.resolve([]),
    Promise.all(extraDimensionTypes.map((dt) => getDimensionTree(tenant.tenantId, dt.id, year, conjuntoEstruturaId))),
  ]);

  const { rows: accountRows } = buildDimensionHierarchy(accountNodes);
  const { rows: costCenterRows } = buildDimensionHierarchy(costCenterNodes);
  const entityHierarchy = buildDimensionHierarchy(entityNodes);
  const { rows: entityRows } = entityHierarchy;

  const requestedEntity = searchParams.entidade;
  const entityNodeId =
    requestedEntity && entityNodes.some((n) => n.id === requestedEntity)
      ? requestedEntity
      : entityRows[0]?.item.id;

  // Só entram como eixo extra de fato as dimensões que já têm pelo menos
  // um item cadastrado (ver Dimensões) — sem isso não haveria o que
  // selecionar, então a dimensão fica "marcada" mas ainda inerte na
  // Matriz até a usuária cadastrar itens nela.
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

  const packages = await getPackages(tenant.tenantId, year, orcamentoId);

  // Pacotes da Entidade selecionada (ou sem Entidade). Recorte da Matriz:
  // "all" = consolidado (somente leitura), "none" = sem pacote, ou um Pacote.
  const entityPackages = packages.filter((p) => !p.entityNodeId || p.entityNodeId === entityNodeId);
  const requestedPackage = searchParams.pacote;
  const defaultScope = entityPackages.length > 0 ? "all" : "none";
  const scopeValue =
    requestedPackage === "all" || requestedPackage === "none"
      ? requestedPackage
      : entityPackages.some((p) => p.id === requestedPackage)
        ? (requestedPackage as string)
        : defaultScope;
  const packageScope: PackageScope =
    scopeValue === "all" ? { kind: "all" } : scopeValue === "none" ? { kind: "none" } : { kind: "package", id: scopeValue };
  const selectedPackage = packageScope.kind === "package" ? entityPackages.find((p) => p.id === packageScope.id) : null;
  const packageLocked = selectedPackage?.status === "submetido" || selectedPackage?.status === "aprovado";
  const gridHint = !orcamentoId
    ? t("noOrcamentoHint")
    : packageScope.kind === "all"
      ? t("consolidatedHint")
      : packageLocked
        ? t("packageLockedHint")
        : null;

  const entries =
    !missingSetup && entityNodeId
      ? await getMatrixEntries(tenant.tenantId, year, month, entityNodeId, orcamentoId, extraDimensionsFilter, packageScope)
      : [];

  return (
    <>
      <div className="admin-subheader">
        <div className="orc-area-heading">
          {orcamentoId && <BackToMapLink orcamentoId={orcamentoId} label={tOrc("backToMap")} />}
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
              packageValue={scopeValue}
              packageOptions={entityPackages.map((p) => ({ id: p.id, name: p.name }))}
              packageLabel={labels.budgetPackage}
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
              entityHasChildren={entityHierarchy.hasChildren}
              entityIsLastChild={entityHierarchy.isLastChild}
              selectedEntityId={entityNodeId ?? ""}
              selectedPackageId={selectedPackage?.id ?? null}
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
                orcamentoId={orcamentoId}
                packageId={selectedPackage?.id ?? null}
                editable={packageScope.kind === "none" || (packageScope.kind === "package" && !packageLocked)}
                readOnlyHint={gridHint}
                key={`${scopeValue}:${entityNodeId}:${year}:${month}:${orcamentoId}`}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
