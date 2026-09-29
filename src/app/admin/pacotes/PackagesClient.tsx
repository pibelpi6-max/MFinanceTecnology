"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { ColumnMeta } from "@/components/ui/DataTable/types";
import type { BudgetPackageRow, PackageStatus } from "@/lib/packages/types";
import { PackageFormModal } from "./PackageFormModal";
import { PackageHistoryDrawer } from "./PackageHistoryDrawer";
import { deletePackage, transitionPackageStatus } from "./_actions";

interface PackagesClientProps {
  year: number;
  packages: BudgetPackageRow[];
  costCenterNodes: { id: string; name: string }[];
  entityNodes: { id: string; name: string }[];
  packageLabel: string;
  role: "admin" | "elaborador" | "aprovador" | "leitor";
  currentUserId: string;
}

const NEXT_ACTIONS: Record<PackageStatus, { to: PackageStatus; variant: "primary" | "secondary" | "danger" }[]> = {
  rascunho: [{ to: "em_elaboracao", variant: "primary" }],
  em_elaboracao: [{ to: "submetido", variant: "primary" }],
  submetido: [
    { to: "aprovado", variant: "primary" },
    { to: "rejeitado", variant: "danger" },
  ],
  rejeitado: [{ to: "em_elaboracao", variant: "secondary" }],
  aprovado: [],
};

export function PackagesClient({
  year,
  packages,
  costCenterNodes,
  entityNodes,
  packageLabel,
  role,
  currentUserId,
}: PackagesClientProps) {
  const router = useRouter();
  const t = useTranslations("packages");
  const tc = useTranslations("common");

  const [editing, setEditing] = useState<BudgetPackageRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<BudgetPackageRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<BudgetPackageRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const canApprove = role === "admin" || role === "aprovador";

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const list = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);
    if (!list.includes(year)) list.unshift(year);
    return list.sort((a, b) => a - b);
  }, [year, currentYear]);

  const handleTransition = useCallback(
    (pkg: BudgetPackageRow, to: PackageStatus) => {
      setActionError(null);
      startTransition(async () => {
        const result = await transitionPackageStatus({ id: pkg.id, fromStatus: pkg.status, toStatus: to });
        if (result.error) {
          setActionError(result.error);
          return;
        }
        router.refresh();
      });
    },
    [router]
  );

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await deletePackage({ id: deleting.id, entriesCount: deleting.entriesCount, status: deleting.status });
    setDeleteLoading(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  const columns: ColumnMeta<BudgetPackageRow>[] = useMemo(
    () => [
      {
        key: "name",
        label: t("name"),
        getText: (p) => p.name,
        render: (p) => <span className="font-medium text-gray-800">{p.name}</span>,
      },
      {
        key: "entity",
        label: t("entity"),
        getText: (p) => p.entityName ?? "",
        render: (p) => <span className="text-sm text-gray-600">{p.entityName ?? "—"}</span>,
      },
      {
        key: "costCenter",
        label: t("costCenter"),
        getText: (p) => p.costCenterName ?? "",
        render: (p) => <span className="text-sm text-gray-600">{p.costCenterName ?? t("allCostCenters")}</span>,
      },
      {
        key: "status",
        label: t("status"),
        width: 150,
        noTooltip: true,
        render: (p) => <span className={`status-badge status-badge--${p.status}`}>{t(`statusValues.${p.status}`)}</span>,
      },
      {
        key: "actions",
        label: t("actions"),
        width: 260,
        noTooltip: true,
        render: (p) => {
          const actions = NEXT_ACTIONS[p.status].filter(
            (a) => !(a.to === "aprovado" || a.to === "rejeitado") || canApprove
          );
          return (
            <div className="flex items-center gap-1.5">
              {actions.map((a) => (
                <Button
                  key={a.to}
                  variant={a.variant}
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleTransition(p, a.to)}
                >
                  {t(`transitionButtons.${a.to}`)}
                </Button>
              ))}
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                onClick={() => setHistoryOf(p)}
              >
                {t("history")}
              </button>
            </div>
          );
        },
      },
    ],
    [t, canApprove, isPending, handleTransition]
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div />
        <select
          className="year-select"
          value={year}
          onChange={(e) => router.push(`/admin/pacotes?ano=${e.target.value}`)}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {actionError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2">
          <p className="text-sm text-red-600">{actionError}</p>
        </div>
      )}

      <DataTable<BudgetPackageRow>
        items={packages}
        columns={columns}
        prefsKey="pacotes_cols"
        onEdit={(p) => setEditing(p)}
        onDelete={(p) => setDeleting(p)}
        onNew={() => setEditing("new")}
        newLabel={t("new", { label: packageLabel })}
        emptyMessage={t("emptyMessage", { year })}
      />

      <PackageFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        editing={editing === "new" ? null : editing}
        year={year}
        costCenterNodes={costCenterNodes}
        entityNodes={entityNodes}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <PackageHistoryDrawer pkg={historyOf} onClose={() => setHistoryOf(null)} currentUserId={currentUserId} />

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
          <p className="text-sm text-gray-600">{deleting && t("deleteConfirmBody", { name: deleting.name })}</p>
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
