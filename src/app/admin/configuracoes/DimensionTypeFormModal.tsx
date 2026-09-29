"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { DimensionType } from "@/lib/dimensions/types";
import { createDimensionType, updateDimensionType } from "./_actions";

interface DimensionTypeFormModalProps {
  open: boolean;
  onClose: () => void;
  editing: DimensionType | null;
  onSaved: () => void;
}

export function DimensionTypeFormModal({ open, onClose, editing, onSaved }: DimensionTypeFormModalProps) {
  const t = useTranslations("settings.dimensions");
  const tc = useTranslations("common");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? "");
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setError(null);
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = editing
      ? await updateDimensionType({ id: editing.id, name: name.trim(), description: description.trim() || null })
      : await createDimensionType({ code: code.trim(), name: name.trim(), description: description.trim() || null });

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
          <Button type="submit" form="dimension-type-form" isLoading={loading} loadingText={tc("saving")}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="dimension-type-form" onSubmit={handleSubmit} className="space-y-4">
        {!editing && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("code")}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="ex: projeto"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-[11px] text-gray-400">{t("codeHint")}</p>
          </div>
        )}
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
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("fieldDescription")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
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
