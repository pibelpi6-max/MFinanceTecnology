"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createPackage, updatePackage } from "./_actions";
import type { BudgetPackageRow } from "@/lib/packages/types";

interface PackageFormModalProps {
  open: boolean;
  onClose: () => void;
  editing: BudgetPackageRow | null;
  year: number;
  costCenterNodes: { id: string; name: string }[];
  onSaved: () => void;
}

export function PackageFormModal({ open, onClose, editing, year, costCenterNodes, onSaved }: PackageFormModalProps) {
  const t = useTranslations("packages");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [costCenterNodeId, setCostCenterNodeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setCostCenterNodeId(editing?.costCenterNodeId ?? "");
    setError(null);
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = editing
      ? await updatePackage({
          id: editing.id,
          currentStatus: editing.status,
          name: name.trim(),
          costCenterNodeId: costCenterNodeId || null,
        })
      : await createPackage({ year, name: name.trim(), costCenterNodeId: costCenterNodeId || null });

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
      title={editing ? t("edit") : t("new", { label: "" })}
      subtitle={String(year)}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="package-form" isLoading={loading} loadingText={tc("saving")}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="package-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("costCenter")}</label>
          <select
            value={costCenterNodeId}
            onChange={(e) => setCostCenterNodeId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{t("allCostCenters")}</option>
            {costCenterNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
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
