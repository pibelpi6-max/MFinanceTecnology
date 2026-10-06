"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { DimensionType, DimensionStructure } from "@/lib/dimensions/types";
import type { ConjuntoEstruturaWithItems } from "@/lib/orcamentos/queries";
import { createConjunto, updateConjunto } from "./_conjuntoActions";

interface ConjuntoFormModalProps {
  open: boolean;
  onClose: () => void;
  dimensionTypes: DimensionType[];
  structuresByType: Record<string, DimensionStructure[]>;
  /** Conjunto sendo editado, ou null para criar um novo. */
  editing: ConjuntoEstruturaWithItems | null;
  onSaved: () => void;
}

/**
 * Formulário de Conjunto de Estruturas: nome + 1 seletor de Estrutura por
 * tipo de dimensão (dropdown nativo, igual ao padrão já usado em filtros
 * da Matriz) — ver claude/decisoes-arquitetura.md, "Orçamento (entidade
 * nova, versões/revisões)". Uma dimensão sem nenhuma estrutura cadastrada
 * não aparece como seletor (nada pra escolher); o admin pode deixar um
 * tipo sem seleção, o Conjunto só não cobre essa dimensão ainda.
 */
export function ConjuntoFormModal({
  open,
  onClose,
  dimensionTypes,
  structuresByType,
  editing,
  onSaved,
}: ConjuntoFormModalProps) {
  const t = useTranslations("settings.conjuntos");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    const initial: Record<string, string> = {};
    editing?.items.forEach((it) => {
      initial[it.dimension_type_id] = it.structure_id;
    });
    setSelections(initial);
    setError(null);
  }, [open, editing]);

  const typesWithStructures = dimensionTypes.filter((d) => (structuresByType[d.id] ?? []).length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const items = Object.entries(selections)
      .filter(([, structureId]) => structureId)
      .map(([dimensionTypeId, structureId]) => ({ dimensionTypeId, structureId }));

    const result = editing
      ? await updateConjunto({ id: editing.id, name: name.trim(), items })
      : await createConjunto({ name: name.trim(), items });

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
          <Button type="submit" form="conjunto-form" isLoading={loading} loadingText={tc("saving")}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="conjunto-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {typesWithStructures.length === 0 ? (
          <p className="text-xs text-gray-400">{t("noStructuresAvailable")}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-600">{t("pickStructures")}</p>
            {typesWithStructures.map((d) => (
              <div key={d.id}>
                <label className="mb-1 block text-xs text-gray-500">{d.name}</label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={selections[d.id] ?? ""}
                  onChange={(e) => setSelections((prev) => ({ ...prev, [d.id]: e.target.value }))}
                >
                  <option value="">{t("noneSelected")}</option>
                  {(structuresByType[d.id] ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
