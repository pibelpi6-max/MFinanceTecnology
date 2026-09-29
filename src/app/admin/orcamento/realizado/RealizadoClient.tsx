"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { ColumnMeta } from "@/components/ui/DataTable/types";
import type { DimensionNodeRow } from "@/lib/dimensions/types";
import type { ExpenseEntryRow } from "@/lib/actuals/types";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { deleteExpenseEntry } from "./_actions";

interface RealizadoClientProps {
  year: number;
  month: number;
  entityNodeId: string;
  accounts: DimensionNodeRow[];
  costCenters: DimensionNodeRow[];
  initialEntries: ExpenseEntryRow[];
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export function RealizadoClient({ year, month, entityNodeId, accounts, costCenters, initialEntries }: RealizadoClientProps) {
  const router = useRouter();
  const t = useTranslations("actuals");
  const tc = useTranslations("common");

  const [editing, setEditing] = useState<ExpenseEntryRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ExpenseEntryRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const costCenterName = useMemo(() => new Map(costCenters.map((c) => [c.id, c.name])), [costCenters]);

  const total = useMemo(() => initialEntries.reduce((sum, e) => sum + e.amount, 0), [initialEntries]);

  const columns: ColumnMeta<ExpenseEntryRow>[] = useMemo(
    () => [
      {
        key: "account",
        label: t("account"),
        getText: (e) => accountName.get(e.accountNodeId) ?? "",
        render: (e) => <span className="font-medium text-gray-800">{accountName.get(e.accountNodeId) ?? "—"}</span>,
      },
      {
        key: "costCenter",
        label: t("costCenter"),
        getText: (e) => costCenterName.get(e.costCenterNodeId) ?? "",
      },
      {
        key: "description",
        label: t("description"),
        getText: (e) => e.description ?? "",
      },
      {
        key: "date",
        label: t("date"),
        width: 110,
        render: (e) => <span className="text-xs text-gray-500">{dateFormatter.format(new Date(e.createdAt))}</span>,
      },
      {
        key: "amount",
        label: t("amount"),
        align: "right",
        width: 130,
        render: (e) => <span className="font-medium">{currencyFormatter.format(e.amount)}</span>,
      },
    ],
    [t, accountName, costCenterName]
  );

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await deleteExpenseEntry({ id: deleting.id });
    setDeleteLoading(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {t("totalLancado")}: <span className="font-semibold text-gray-800">{currencyFormatter.format(total)}</span>
        </p>
        <Button variant="secondary" size="sm" onClick={() => router.push("/admin/orcamento/comparativo")}>
          {t("goToComparison")}
        </Button>
      </div>

      <DataTable<ExpenseEntryRow>
        items={initialEntries}
        columns={columns}
        prefsKey="realizado_cols"
        onEdit={(e) => setEditing(e)}
        onDelete={(e) => setDeleting(e)}
        onNew={() => setEditing("new")}
        newLabel={t("new")}
        emptyMessage={t("emptyMessage")}
      />

      <ExpenseFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        editing={editing === "new" ? null : editing}
        year={year}
        month={month}
        entityNodeId={entityNodeId}
        accounts={accounts}
        costCenters={costCenters}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <Modal
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        title={t("deleteConfirmTitle")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteLoading}>
              {tc("cancel")}
            </Button>
            <Button variant="danger" isLoading={deleteLoading} loadingText={tc("saving")} onClick={handleConfirmDelete}>
              {tc("delete")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{t("deleteConfirmBody")}</p>
          {deleteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{deleteError}</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
