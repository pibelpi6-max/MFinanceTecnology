import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import { buildDimensionHierarchy } from "@/lib/dimensions/hierarchy";
import { getMatrixEntries } from "@/lib/budget/queries";
import {
  getExpenseEntries,
  sumActualsByCell,
  getTolerances,
  resolveTolerancePct,
  getDeviationExplanations,
} from "@/lib/actuals/queries";
import type { ComparisonCell } from "@/lib/actuals/types";
import { RealizadoFilters } from "../realizado/RealizadoFilters";
import { ComparativoClient } from "./ComparativoClient";

interface PageProps {
  searchParams: { ano?: string; mes?: string; entidade?: string };
}

export default async function ComparativoPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const t = await getTranslations("actuals");

  const [contaType, centroCustoType, entidadeType] = await Promise.all([
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.CONTA),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.CENTRO_CUSTO),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.ENTIDADE),
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

  let rows: ComparisonCell[] = [];
  const accountNameById = new Map(accountNodes.map((a) => [a.id, a.name]));
  const costCenterNameById = new Map(costCenterNodes.map((c) => [c.id, c.name]));

  if (!missingSetup && entityNodeId) {
    const [budgetEntries, expenseEntries, tolerances, explanations] = await Promise.all([
      getMatrixEntries(tenant.tenantId, year, month, entityNodeId),
      getExpenseEntries(tenant.tenantId, year, month, entityNodeId),
      getTolerances(tenant.tenantId, year),
      getDeviationExplanations(tenant.tenantId, year, month),
    ]);

    const actualByCell = sumActualsByCell(expenseEntries);
    const budgetByCell: Record<string, Record<string, number>> = {};
    for (const e of budgetEntries) {
      if (!budgetByCell[e.accountNodeId]) budgetByCell[e.accountNodeId] = {};
      budgetByCell[e.accountNodeId][e.costCenterNodeId] = e.amount;
    }

    const cellKeys = new Set<string>();
    for (const acc of Object.keys(budgetByCell)) {
      for (const cc of Object.keys(budgetByCell[acc])) cellKeys.add(`${acc}:${cc}`);
    }
    for (const acc of Object.keys(actualByCell)) {
      for (const cc of Object.keys(actualByCell[acc])) cellKeys.add(`${acc}:${cc}`);
    }

    rows = Array.from(cellKeys)
      .map((key) => {
        const [accountNodeId, costCenterNodeId] = key.split(":");
        const budgeted = budgetByCell[accountNodeId]?.[costCenterNodeId] ?? 0;
        const actual = actualByCell[accountNodeId]?.[costCenterNodeId] ?? 0;
        const variance = actual - budgeted;
        const variancePct = budgeted !== 0 ? (variance / budgeted) * 100 : null;
        const tolerancePct = resolveTolerancePct(tolerances, accountNodeId, costCenterNodeId);
        const overTolerance = variancePct !== null ? Math.abs(variancePct) > tolerancePct : actual > 0;
        const explanation = explanations[key]?.explanation ?? null;
        const explanationId = explanations[key]?.id ?? null;
        return {
          accountNodeId,
          costCenterNodeId,
          budgeted,
          actual,
          variance,
          variancePct,
          tolerancePct,
          overTolerance,
          explanation,
          explanationId,
        };
      })
      .filter((r) => r.budgeted !== 0 || r.actual !== 0)
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  }

  return (
    <>
      <div className="admin-subheader">
        <div>
          <h1 className="admin-page-title">{t("comparisonTitle")}</h1>
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
          ) : rows.length === 0 ? (
            <div className="matrix-empty-state">
              <p>{t("comparisonEmpty")}</p>
            </div>
          ) : (
            <ComparativoClient
              year={year}
              month={month}
              rows={rows}
              accountNames={Object.fromEntries(accountNameById)}
              costCenterNames={Object.fromEntries(costCenterNameById)}
            />
          )}
        </div>
      </div>
    </>
  );
}
