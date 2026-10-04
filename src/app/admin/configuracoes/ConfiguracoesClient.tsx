"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import type { DimensionType } from "@/lib/dimensions/types";
import { isProtectedDimensionCode } from "@/lib/dimensions/constants";
import { DimensionTypeFormModal } from "./DimensionTypeFormModal";
import { deleteDimensionType, updateFiscalYearStartMonth } from "./_actions";

interface ConfiguracoesClientProps {
  dimensionTypes: DimensionType[];
  fiscalYearStartMonth: number;
  isAdmin: boolean;
}

const MONTH_KEYS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const CUSTOM_DIMENSIONS_LIMIT = 10;

export function ConfiguracoesClient({ dimensionTypes, fiscalYearStartMonth, isAdmin }: ConfiguracoesClientProps) {
  const router = useRouter();
  const t = useTranslations("settings");
  const tm = useTranslations("budget");
  const tc = useTranslations("common");

  const [month, setMonth] = useState(fiscalYearStartMonth);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DimensionType | "new" | null>(null);
  const [deleting, setDeleting] = useState<DimensionType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => setMonth(fiscalYearStartMonth), [fiscalYearStartMonth]);

  async function handleSaveMonth(newMonth: number) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateFiscalYearStartMonth(newMonth);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await deleteDimensionType({ id: deleting.id });
    setDeleteLoading(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  const customCount = dimensionTypes.filter((d) => !d.is_system && !isProtectedDimensionCode(d.code)).length;
  const limitReached = customCount >= CUSTOM_DIMENSIONS_LIMIT;

  return (
    <div className="settings-panel">
      <section className="settings-block">
        <h2 className="settings-block-title">{t("period.title")}</h2>
        <div className="settings-inline-row">
          <span className="settings-block-intro">{t("period.intro")}</span>
          {isAdmin ? (
            <>
              <select
                className="year-select"
                aria-label={t("period.startMonth")}
                value={month}
                onChange={(e) => {
                  const newMonth = Number(e.target.value);
                  setMonth(newMonth);
                  handleSaveMonth(newMonth);
                }}
              >
                {MONTH_KEYS.map((key, i) => (
                  <option key={key} value={i + 1}>
                    {tm(`months.${key}`)}
                  </option>
                ))}
              </select>
              {saving && <span className="settings-saved-hint">{t("period.saving")}</span>}
              {saved && !saving && <span className="settings-saved-hint">{t("period.saved")}</span>}
            </>
          ) : (
            <span className="text-sm text-gray-700">{tm(`months.${MONTH_KEYS[fiscalYearStartMonth - 1]}`)}</span>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {!isAdmin && <p className="settings-admin-hint">{t("period.adminOnly")}</p>}
      </section>

      <div className="settings-divider" />

      <section className="settings-block">
        <h2 className="settings-block-title">{t("dimensions.title")}</h2>
        <div className="settings-block-subtitle-row">
          <p className="settings-block-intro">{t("dimensions.intro")}</p>
          <div className="settings-progress-block">
            <div className="settings-progress-block-label">
              <span>{t("dimensions.customUsage")}</span>
              <span className="settings-progress-block-value">
                {customCount}/{CUSTOM_DIMENSIONS_LIMIT}
              </span>
            </div>
            <div className="settings-progress-block-bar">
              <div
                className={`settings-progress-block-fill${limitReached ? " settings-progress-block-fill--full" : ""}`}
                style={{ width: `${(Math.min(customCount, CUSTOM_DIMENSIONS_LIMIT) / CUSTOM_DIMENSIONS_LIMIT) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="settings-block-actions">
          {!isAdmin && <p className="settings-admin-hint">{t("dimensions.adminOnly")}</p>}
          {isAdmin && (
            <Tooltip text={limitReached ? t("dimensions.limitReached") : ""}>
              <Button
                size="sm"
                variant="accent-blue"
                className="px-4"
                disabled={limitReached}
                onClick={() => setEditing("new")}
              >
                {t("dimensions.new")}
              </Button>
            </Tooltip>
          )}
        </div>

        <table className="settings-table">
          <thead>
            <tr>
              <th>{t("dimensions.name")}</th>
              <th>{t("dimensions.code")}</th>
              <th>{t("dimensions.fieldDescription")}</th>
              <th></th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {dimensionTypes.map((d) => (
              <tr key={d.id}>
                <td className="font-medium text-gray-800">{d.name}</td>
                <td>
                  <code className="settings-code">{d.code}</code>
                </td>
                <td className="text-gray-600">{d.description || <span className="text-gray-400">{t("dimensions.noDescription")}</span>}</td>
                <td>
                  <span className={`type-badge${d.is_system || isProtectedDimensionCode(d.code) ? " type-badge--system" : ""}`}>
                    {d.is_system || isProtectedDimensionCode(d.code) ? t("dimensions.system") : t("dimensions.custom")}
                  </span>
                </td>
                {isAdmin && (
                  <td className="text-right">
                    <span className="settings-row-actions">
                      <button type="button" className="settings-edit-link" onClick={() => setEditing(d)}>
                        {t("dimensions.edit")}
                      </button>
                      {!d.is_system && !isProtectedDimensionCode(d.code) && (
                        <button
                          type="button"
                          className="settings-edit-link settings-edit-link--danger"
                          onClick={() => setDeleting(d)}
                        >
                          {tc("delete")}
                        </button>
                      )}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isAdmin && (
        <DimensionTypeFormModal
          open={editing !== null}
          onClose={() => setEditing(null)}
          editing={editing === "new" ? null : editing}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {isAdmin && (
        <Modal
          open={deleting !== null}
          onClose={() => {
            setDeleting(null);
            setDeleteError(null);
          }}
          title={t("dimensions.deleteConfirmTitle")}
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
            <p className="text-sm text-gray-600">
              {deleting &&
                t.rich("dimensions.deleteConfirmBody", {
                  name: deleting.name,
                  b: (chunks) => <strong className="font-semibold text-gray-900">{chunks}</strong>,
                })}
            </p>
            {deleteError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-600">{deleteError}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
