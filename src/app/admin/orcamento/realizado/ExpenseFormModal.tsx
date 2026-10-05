"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { DimensionNodeRow } from "@/lib/dimensions/types";
import type { ExpenseEntryRow } from "@/lib/actuals/types";
import { createExpenseEntry, updateExpenseEntry } from "./_actions";

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  editing?: ExpenseEntryRow | null;
  year: number;
  month: number;
  entityNodeId: string;
  accounts: DimensionNodeRow[];
  costCenters: DimensionNodeRow[];
  onSaved: () => void;
}

function formatAmountForInput(amount: number): string {
  return amount === 0 ? "" : String(amount).replace(".", ",");
}

export function ExpenseFormModal({
  open,
  onClose,
  editing,
  year,
  month,
  entityNodeId,
  accounts,
  costCenters,
  onSaved,
}: ExpenseFormModalProps) {
  const t = useTranslations("actuals");
  const tc = useTranslations("common");

  const [accountNodeId, setAccountNodeId] = useState("");
  const [costCenterNodeId, setCostCenterNodeId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccountNodeId(editing?.accountNodeId ?? "");
    setCostCenterNodeId(editing?.costCenterNodeId ?? "");
    setAmount(editing ? formatAmountForInput(editing.amount) : "");
    setDescription(editing?.description ?? "");
    setError(null);
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!accountNodeId || !costCenterNodeId) {
      setError(t("selectAccountAndCostCenter"));
      return;
    }
    setLoading(true);

    const result = editing
      ? await updateExpenseEntry({
          id: editing.id,
          accountNodeId,
          costCenterNodeId,
          amount: parsedAmount,
          description: description.trim(),
        })
      : await createExpenseEntry({
          year,
          month,
          entityNodeId,
          accountNodeId,
          costCenterNodeId,
          amount: parsedAmount,
          description: description.trim(),
        });

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t("edit") : t("new")}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="expense-form" isLoading={loading} loadingText={tc("saving")}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("account")}</label>
          <select
            value={accountNodeId}
            onChange={(e) => setAccountNodeId(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="" disabled>
              {t("selectPlaceholder")}
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {"— ".repeat(Math.max(0, a.level - 1))}
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("costCenter")}</label>
          <select
            value={costCenterNodeId}
            onChange={(e) => setCostCenterNodeId(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="" disabled>
              {t("selectPlaceholder")}
            </option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {"— ".repeat(Math.max(0, c.level - 1))}
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("amount")}</label>
          <input
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*[.,]?\d*$/.test(v)) setAmount(v);
            }}
            inputMode="decimal"
            placeholder="0,00"
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("description")}</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
