"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { DimensionStructure } from "@/lib/dimensions/types";
import { createDimensionStructure, renameDimensionStructure } from "./_structureActions";

type StructureModalMode = "create" | "rename";

interface StructureFormModalProps {
  open: boolean;
  onClose: () => void;
  dimensionTypeId: string;
  mode: StructureModalMode;
  /** Estrutura sendo renomeada (mode="rename"). null em mode="create".
   * Duplicar virou uma caixa de confirmação simples (ver structureDuplicating
   * em ConfiguracoesClient.tsx) em vez de passar por este formulário. */
  source: DimensionStructure | null;
  year: number;
  /** Recebe o id da estrutura criada/renomeada, pra já selecioná-la no painel. */
  onSaved: (structureId: string) => void;
}

const TITLE_KEY: Record<StructureModalMode, string> = {
  create: "newStructure",
  rename: "renameStructure",
};

export function StructureFormModal({
  open,
  onClose,
  dimensionTypeId,
  mode,
  source,
  onSaved,
}: StructureFormModalProps) {
  const t = useTranslations("settings.dimensions");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(mode === "rename" ? source?.name ?? "" : "");
    setError(null);
  }, [open, mode, source]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmed = name.trim();
    const result =
      mode === "rename" && source
        ? await renameDimensionStructure({ id: source.id, name: trimmed })
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
