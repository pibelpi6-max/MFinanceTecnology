"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { ConjuntoEstrutura } from "@/lib/orcamentos/types";
import type { Orcamento, OrcamentoStatus } from "@/lib/orcamentos/types";
import { createOrcamento, updateOrcamento } from "./_orcamentoActions";

interface OrcamentoFormModalProps {
  open: boolean;
  onClose: () => void;
  conjuntos: ConjuntoEstrutura[];
  /** Orçamento sendo editado, ou null para criar um novo. */
  editing: Orcamento | null;
  defaultYear: number;
  onSaved: () => void;
}

const STATUS_OPTIONS: OrcamentoStatus[] = ["rascunho", "ativo", "encerrado"];

/**
 * Formulário de Orçamento: ano + rótulo de revisão + status + Conjunto de
 * Estruturas (único, não um por dimensão) — ver
 * claude/decisoes-arquitetura.md, "Orçamento (entidade nova,
 * versões/revisões)".
 */
export function OrcamentoFormModal({ open, onClose, conjuntos, editing, defaultYear, onSaved }: OrcamentoFormModalProps) {
  const t = useTranslations("settings.orcamentos");
  const tc = useTranslations("common");

  const [year, setYear] = useState(defaultYear);
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<OrcamentoStatus>("rascunho");
  const [conjuntoId, setConjuntoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setYear(editing?.year ?? defaultYear);
    setLabel(editing?.label ?? "");
    setStatus(editing?.status ?? "rascunho");
    setConjuntoId(editing?.conjunto_estrutura_id ?? "");
    setError(null);
  }, [open, editing, defaultYear]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      year,
      label: label.trim(),
      status,
      conjuntoEstruturaId: conjuntoId || null,
    };
    const result = editing ? await updateOrcamento({ id: editing.id, ...payload }) : await createOrcamento(payload);

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
          <Button type="submit" form="orcamento-form" isLoading={loading} loadingText={tc("saving")}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="orcamento-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("year")}</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("status")}</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={status}
              onChange={(e) => setStatus(e.target.value as OrcamentoStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("label")}</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            autoFocus
            placeholder={t("labelPlaceholder")}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("conjunto")}</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={conjuntoId}
            onChange={(e) => setConjuntoId(e.target.value)}
          >
            <option value="">{t("noneSelected")}</option>
            {conjuntos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {conjuntos.length === 0 && <p className="mt-1 text-[11px] text-gray-400">{t("noConjuntosHint")}</p>}
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
