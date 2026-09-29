"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { ComparisonCell } from "@/lib/actuals/types";
import { saveDeviationExplanation, suggestDeviationExplanation } from "./_actions";

interface DeviationExplanationModalProps {
  row: ComparisonCell | null;
  onClose: () => void;
  year: number;
  month: number;
  accountName: string;
  costCenterName: string;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DeviationExplanationModal({ row, onClose, year, month, accountName, costCenterName }: DeviationExplanationModalProps) {
  const router = useRouter();
  const t = useTranslations("actuals");
  const tc = useTranslations("common");

  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(row?.explanation ?? "");
    setError(null);
  }, [row]);

  async function handleSuggest() {
    if (!row) return;
    setSuggesting(true);
    setError(null);
    const result = await suggestDeviationExplanation({
      accountName,
      costCenterName,
      year,
      month,
      budgeted: row.budgeted,
      actual: row.actual,
      variancePct: row.variancePct,
    });
    setSuggesting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setText(result.suggestion ?? "");
  }

  async function handleSave() {
    if (!row) return;
    setSaving(true);
    setError(null);
    const result = await saveDeviationExplanation({
      explanationId: row.explanationId,
      year,
      month,
      accountNodeId: row.accountNodeId,
      costCenterNodeId: row.costCenterNodeId,
      explanation: text,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title={t("explainDeviation")}
      subtitle={row ? `${accountName} · ${costCenterName}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {tc("cancel")}
          </Button>
          <Button variant="primary" isLoading={saving} loadingText={tc("saving")} onClick={handleSave}>
            {tc("save")}
          </Button>
        </>
      }
    >
      {row && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <p>
              {t("budgeted")}: <strong>{currencyFormatter.format(row.budgeted)}</strong> · {t("actual")}:{" "}
              <strong>{currencyFormatter.format(row.actual)}</strong>
              {row.variancePct !== null && (
                <>
                  {" "}
                  · {t("variance")}: <strong>{row.variancePct > 0 ? "+" : ""}{row.variancePct.toFixed(1)}%</strong>
                </>
              )}
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-600">{t("explanationLabel")}</label>
              <button
                type="button"
                onClick={handleSuggest}
                disabled={suggesting}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {suggesting ? t("suggesting") : t("suggestWithAI")}
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder={t("explanationPlaceholder")}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
