"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { DimensionStructure } from "@/lib/dimensions/types";
import { createDimensionStructure, renameDimensionStructure, duplicateDimensionStructure } from "./_structureActions";

type StructureModalMode = "create" | "rename" | "duplicate";

interface StructureFormModalProps {
  open: boolean;
  onClose: () => void;
  dimensionTypeId: string;
  mode: StructureModalMode;
  /** Estrutura sendo renomeada (mode="rename") ou duplicada (mode="duplicate"). null em mode="create". */
  source: DimensionStructure | null;
  year: number;
  /** Recebe o id da estrutura criada/renomeada/duplicada, pra já selecioná-la no painel. */
  onSaved: (structureId: string) => void;
}

const TITLE_KEY: Record<StructureModalMode, string> = {
  create: "newStructure",
  rename: "renameStructure",
  duplicate: "duplicateStructure",
};

export function StructureFormModal({
  open,
  onClose,
  dimensionTypeId,
  mode,
  source,
  year,
  onSaved,
}: StructureFormModalProps) {
  const t = useTranslations("settings.dimensions");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "rename") setName(source?.name ?? "");
    else if (mode === "duplicate") setName(source ? t("duplicateNameSuggestion", { name: source.name }) : "");
    else setName("");
    setError(null);
  }, [open, mode, source, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmed = name.trim();
    const result =
      mode === "rename" && source
        ? await renameDimensionStructure({ id: source.id, name: trimmed })
        : mode === "duplicate" && source
          ? await duplicateDimensionStructure({ id: source.id, newName: trimmed, year })
          : await createDimensionStructure({ dimensionTypeId, name: trimmed });

    setLoading(false);
    if (result.error || !result.id) {
      setError(result.error ?? "Erro inesperado");
      return;
    }
    onSaved(result.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(TITLE_KEY[mode])}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="structure-form" isLoading={loading} loadingText={tc("saving")}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="structure-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("structureName")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {mode === "duplicate" && <p className="mt-1 text-[11px] text-gray-400">{t("duplicateStructureHint")}</p>}
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
