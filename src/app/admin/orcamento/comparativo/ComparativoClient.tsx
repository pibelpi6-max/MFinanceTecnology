"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { ComparisonCell } from "@/lib/actuals/types";
import { DeviationExplanationModal } from "./DeviationExplanationModal";

interface ComparativoClientProps {
  year: number;
  month: number;
  rows: ComparisonCell[];
  accountNames: Record<string, string>;
  costCenterNames: Record<string, string>;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function ComparativoClient({ year, month, rows, accountNames, costCenterNames }: ComparativoClientProps) {
  const t = useTranslations("actuals");
  const [explaining, setExplaining] = useState<ComparisonCell | null>(null);

  return (
    <>
      <div className="matrix-scroll">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-th-account">{t("account")}</th>
              <th className="matrix-th-cc">{t("costCenter")}</th>
              <th className="matrix-th-total">{t("budgeted")}</th>
              <th className="matrix-th-total">{t("actual")}</th>
              <th className="matrix-th-total">{t("variance")}</th>
              <th className="matrix-th-total">{t("varianceStatus")}</th>
              <th className="matrix-th-total">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${row.accountNodeId}:${row.costCenterNodeId}`;
              return (
                <tr key={key} className={row.overTolerance ? "comparativo-row-over" : undefined}>
                  <td className="matrix-td-account">{accountNames[row.accountNodeId] ?? "—"}</td>
                  <td className="matrix-td-cell" style={{ textAlign: "left" }}>
                    {costCenterNames[row.costCenterNodeId] ?? "—"}
                  </td>
                  <td className="matrix-td-total">{currencyFormatter.format(row.budgeted)}</td>
                  <td className="matrix-td-total">{currencyFormatter.format(row.actual)}</td>
                  <td className="matrix-td-total">{formatPct(row.variancePct)}</td>
                  <td className="matrix-td-total">
                    <span className={`status-badge ${row.overTolerance ? "status-badge--rejeitado" : "status-badge--aprovado"}`}>
                      {row.overTolerance ? t("overTolerance") : t("withinTolerance")}
                    </span>
                  </td>
                  <td className="matrix-td-total">
                    <Button variant={row.explanation ? "secondary" : "warning"} size="sm" onClick={() => setExplaining(row)}>
                      {row.explanation ? t("viewExplanation") : t("explain")}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DeviationExplanationModal
        row={explaining}
        onClose={() => setExplaining(null)}
        year={year}
        month={month}
        accountName={explaining ? accountNames[explaining.accountNodeId] ?? "" : ""}
        costCenterName={explaining ? costCenterNames[explaining.costCenterNodeId] ?? "" : ""}
      />
    </>
  );
}
