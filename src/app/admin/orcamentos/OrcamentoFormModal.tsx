"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  ORCAMENTO_LABEL_MAX,
  ORCAMENTO_STATUSES,
  ORCAMENTO_TIPOS,
  type ConjuntoEstrutura,
  type Orcamento,
  type OrcamentoStatus,
  type OrcamentoTipo,
} from "@/lib/orcamentos/types";
import { createOrcamento, updateOrcamento } from "./_actions";

interface OrcamentoFormModalProps {
  open: boolean;
  onClose: () => void;
  conjuntos: ConjuntoEstrutura[];
  /** Orçamento sendo editado, ou null para criar um novo. */
  editing: Orcamento | null;
  defaultYear: number;
  onSaved: (id: string) => void;
}

const FIELD =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function OrcamentoFormModal({ open, onClose, conjuntos, editing, defaultYear, onSaved }: OrcamentoFormModalProps) {
  const t = useTranslations("orcamentos");
  const tc = useTranslations("common");

  const [year, setYear] = useState(defaultYear);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [tipo, setTipo] = useState<OrcamentoTipo>("orcamento");
  const [status, setStatus] = useState<OrcamentoStatus>("rascunho");
  const [conjuntoId, setConjuntoId] = useState("");
  const [oficial, setOficial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setYear(editing?.year ?? defaultYear);
    setLabel(editing?.label ?? "");
    setDescription(editing?.description ?? "");
    setTipo(editing?.tipo ?? "orcamento");
    setStatus(editing?.status ?? "rascunho");
    setConjuntoId(editing?.conjunto_estrutura_id ?? "");
    setOficial(editing?.oficial ?? false);
    setError(null);
  }, [open, editing, defaultYear]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      year,
      label: label.trim(),
      description,
      tipo,
      status,
      oficial,
      conjuntoEstruturaId: conjuntoId || null,
    };
    const result = editing ? await updateOrcamento({ id: editing.id, ...payload }) : await createOrcamento(payload);

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
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label className="text-xs font-medium text-gray-600">{t("name")}</label>
            <span className="text-[11px] text-gray-400">
              {label.length}/{ORCAMENTO_LABEL_MAX}
            </span>
          </div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={ORCAMENTO_LABEL_MAX}
            required
            autoFocus
            placeholder={t("namePlaceholder")}
            className={FIELD}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("description")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("descriptionPlaceholder")}
            className={`${FIELD} resize-none`}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("year")}</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
              className={FIELD}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("type")}</label>
            <select className={FIELD} value={tipo} onChange={(e) => setTipo(e.target.value as OrcamentoTipo)}>
              {ORCAMENTO_TIPOS.map((v) => (
                <option key={v} value={v}>
                  {t(`tipo_${v}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("status")}</label>
            <select className={FIELD} value={status} onChange={(e) => setStatus(e.target.value as OrcamentoStatus)}>
              {ORCAMENTO_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {t(`status_${v}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("conjunto")}</label>
          <select className={FIELD} value={conjuntoId} onChange={(e) => setConjuntoId(e.target.value)}>
            <option value="">{t("noneSelected")}</option>
            {conjuntos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {conjuntos.length === 0 && <p className="mt-1 text-[11px] text-gray-400">{t("noConjuntosHint")}</p>}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50">
          <input
            type="checkbox"
            checked={oficial}
            onChange={(e) => setOficial(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#3E6FE0]"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#F5B301" stroke="#E09B00" strokeWidth={1.4} strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" />
              </svg>
              {t("official")}
            </span>
            <span className="mt-0.5 block text-[11px] text-gray-400">{t("officialHint", { year })}</span>
          </span>
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
