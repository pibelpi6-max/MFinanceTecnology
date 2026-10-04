"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { DimensionType } from "@/lib/dimensions/types";
import { isProtectedDimensionCode } from "@/lib/dimensions/constants";
import type { ModuleType } from "@/lib/modules/types";
import { createDimensionType, updateDimensionType } from "./_actions";

interface DimensionTypeFormModalProps {
  open: boolean;
  onClose: () => void;
  editing: DimensionType | null;
  modules: ModuleType[];
  initialModuleIds: string[];
  onSaved: () => void;
}

export function DimensionTypeFormModal({
  open,
  onClose,
  editing,
  modules,
  initialModuleIds,
  onSaved,
}: DimensionTypeFormModalProps) {
  const t = useTranslations("settings.dimensions");
  const tc = useTranslations("common");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCodeLocked = editing ? isProtectedDimensionCode(editing.code) : false;

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? "");
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setModuleIds(initialModuleIds);
    setError(null);
  }, [open, editing, initialModuleIds]);

  function toggleModule(moduleId: string) {
    setModuleIds((prev) => (prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = editing
      ? await updateDimensionType({
          id: editing.id,
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
          moduleIds,
        })
      : await createDimensionType({
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
          moduleIds,
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
          <Button type="submit" form="dimension-type-form" isLoading={loading} loadingText={tc("saving")}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="dimension-type-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("code")}</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            disabled={isCodeLocked}
            placeholder="ex: projeto"
            className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${
              isCodeLocked ? "cursor-not-allowed bg-gray-50 text-gray-400" : "text-gray-800"
            }`}
          />
          <p className="mt-1 text-[11px] text-gray-400">{isCodeLocked ? t("codeLockedHint") : t("codeHint")}</p>
        </div>
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
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("modulesLabel")}</label>
          {modules.length === 0 ? (
            <p className="text-[11px] text-gray-400">{t("modulesEmptyHint")}</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-gray-200 px-3 py-2">
              {modules.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={moduleIds.includes(m.id)}
                    onChange={() => toggleModule(m.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary/30"
                  />
                  {m.name}
                </label>
              ))}
            </div>
          )}
          <p className="mt-1 text-[11px] text-gray-400">{t("modulesHint")}</p>
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
