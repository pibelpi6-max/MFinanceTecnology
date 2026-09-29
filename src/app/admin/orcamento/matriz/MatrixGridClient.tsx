"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { saveMatrixEntries } from "./_actions";
import type { DimensionNodeRow } from "@/lib/dimensions/types";
import type { HierarchyRow } from "@/lib/dimensions/hierarchy";
import type { MatrixEntry } from "@/lib/budget/types";

interface MatrixGridClientProps {
  year: number;
  month: number;
  entityNodeId: string;
  accounts: HierarchyRow<DimensionNodeRow>[];
  costCenters: DimensionNodeRow[];
  initialEntries: MatrixEntry[];
}

// [accountId][costCenterId] = texto digitado na célula (raw, não parseado
// ainda — mantém "-", "," etc enquanto o usuário está digitando).
type ValuesMap = Record<string, Record<string, string>>;

function formatAmountForInput(amount: number): string {
  if (amount === 0) return "";
  return String(amount).replace(".", ",");
}

function buildInitialValues(entries: MatrixEntry[]): ValuesMap {
  const values: ValuesMap = {};
  for (const e of entries) {
    if (!values[e.accountNodeId]) values[e.accountNodeId] = {};
    values[e.accountNodeId][e.costCenterNodeId] = formatAmountForInput(e.amount);
  }
  return values;
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function MatrixGridClient({
  year,
  month,
  entityNodeId,
  accounts,
  costCenters,
  initialEntries,
}: MatrixGridClientProps) {
  const router = useRouter();
  const t = useTranslations("budget");
  const tc = useTranslations("common");

  const [values, setValues] = useState<ValuesMap>(() => buildInitialValues(initialEntries));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function cellKey(accountId: string, costCenterId: string) {
    return `${accountId}:${costCenterId}`;
  }

  function handleChange(accountId: string, costCenterId: string, raw: string) {
    if (raw !== "" && !/^-?\d*[.,]?\d*$/.test(raw)) return;
    setValues((prev) => ({
      ...prev,
      [accountId]: { ...prev[accountId], [costCenterId]: raw },
    }));
    setDirty((prev) => new Set(prev).add(cellKey(accountId, costCenterId)));
    setSavedAt(null);
  }

  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const { item } of accounts) {
      const row = values[item.id] ?? {};
      totals[item.id] = costCenters.reduce((sum, cc) => sum + parseAmount(row[cc.id]), 0);
    }
    return totals;
  }, [values, accounts, costCenters]);

  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const cc of costCenters) {
      totals[cc.id] = accounts.reduce((sum, { item }) => sum + parseAmount(values[item.id]?.[cc.id]), 0);
    }
    return totals;
  }, [values, accounts, costCenters]);

  const grandTotal = useMemo(
    () => Object.values(rowTotals).reduce((sum, v) => sum + v, 0),
    [rowTotals]
  );

  async function handleSave() {
    setError(null);
    const entries = Array.from(dirty).map((key) => {
      const [accountNodeId, costCenterNodeId] = key.split(":");
      return {
        accountNodeId,
        costCenterNodeId,
        amount: parseAmount(values[accountNodeId]?.[costCenterNodeId]),
      };
    });
    if (entries.length === 0) return;

    startTransition(async () => {
      const result = await saveMatrixEntries({ year, month, entityNodeId, entries });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDirty(new Set());
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  function handleDiscard() {
    setValues(buildInitialValues(initialEntries));
    setDirty(new Set());
    setError(null);
  }

  return (
    <div className="matrix-wrap">
      <div className="matrix-toolbar">
        <div className="matrix-toolbar-info">
          {dirty.size > 0 && (
            <span className="matrix-dirty-hint">{t("unsavedChanges", { count: dirty.size })}</span>
          )}
          {savedAt !== null && dirty.size === 0 && (
            <span className="matrix-saved-hint">{t("savedSuccess")}</span>
          )}
          {error && <span className="matrix-error-hint">{error}</span>}
        </div>
        <div className="matrix-toolbar-actions">
          {dirty.size > 0 && (
            <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={isPending}>
              {t("discard")}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={isPending}
            loadingText={t("saving")}
            disabled={dirty.size === 0}
          >
            {tc("save")}
          </Button>
        </div>
      </div>

      <div className="matrix-scroll">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-th-account">{t("account")}</th>
              {costCenters.map((cc) => (
                <th key={cc.id} className="matrix-th-cc">
                  {cc.name}
                </th>
              ))}
              <th className="matrix-th-total">{t("rowTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(({ item, depth }) => (
              <tr key={item.id}>
                <td className="matrix-td-account" style={{ paddingLeft: 12 + depth * 18 }}>
                  {depth > 0 && <span className="matrix-tree-mark">└</span>}
                  <span>{item.name}</span>
                </td>
                {costCenters.map((cc) => {
                  const key = cellKey(item.id, cc.id);
                  return (
                    <td key={cc.id} className={`matrix-td-cell${dirty.has(key) ? " dirty" : ""}`}>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="matrix-input"
                        value={values[item.id]?.[cc.id] ?? ""}
                        placeholder="0,00"
                        onChange={(e) => handleChange(item.id, cc.id, e.target.value)}
                      />
                    </td>
                  );
                })}
                <td className="matrix-td-rowtotal">{currencyFormatter.format(rowTotals[item.id] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="matrix-td-account matrix-td-footlabel">{t("columnTotal")}</td>
              {costCenters.map((cc) => (
                <td key={cc.id} className="matrix-td-total">
                  {currencyFormatter.format(columnTotals[cc.id] ?? 0)}
                </td>
              ))}
              <td className="matrix-td-grandtotal">{currencyFormatter.format(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
