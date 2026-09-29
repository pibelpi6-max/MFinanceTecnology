"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { DimensionType } from "@/lib/dimensions/types";
import { DimensionTypeFormModal } from "./DimensionTypeFormModal";
import { updateFiscalYearStartMonth } from "./_actions";

interface ConfiguracoesClientProps {
  dimensionTypes: DimensionType[];
  fiscalYearStartMonth: number;
  isAdmin: boolean;
}

const MONTH_KEYS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function ConfiguracoesClient({ dimensionTypes, fiscalYearStartMonth, isAdmin }: ConfiguracoesClientProps) {
  const router = useRouter();
  const t = useTranslations("settings");
  const tm = useTranslations("budget");

  const [month, setMonth] = useState(fiscalYearStartMonth);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DimensionType | "new" | null>(null);

  useEffect(() => setMonth(fiscalYearStartMonth), [fiscalYearStartMonth]);

  async function handleSaveMonth() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateFiscalYearStartMonth(month);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const customCount = dimensionTypes.filter((d) => !d.is_system).length;

  return (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-header">
          <h2 className="settings-card-title">{t("period.title")}</h2>
          <p className="settings-card-intro">{t("period.intro")}</p>
        </div>

        <div className="settings-card-body">
          <label className="settings-field-label">{t("period.startMonth")}</label>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <select
                className="year-select"
                value={month}
                onChange={(e) => {
                  setMonth(Number(e.target.value));
                  setSaved(false);
                }}
              >
                {MONTH_KEYS.map((key, i) => (
                  <option key={key} value={i + 1}>
                    {tm(`months.${key}`)}
                  </option>
                ))}
              </select>
              <Button size="sm" isLoading={saving} loadingText={t("period.saving")} onClick={handleSaveMonth} disabled={month === fiscalYearStartMonth}>
                {t("period.save")}
              </Button>
              {saved && <span className="settings-saved-hint">{t("period.saved")}</span>}
            </div>
          ) : (
            <p className="text-sm text-gray-700">{tm(`months.${MONTH_KEYS[fiscalYearStartMonth - 1]}`)}</p>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {!isAdmin && <p className="settings-admin-hint">{t("period.adminOnly")}</p>}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-header settings-card-header--row">
          <div>
            <h2 className="settings-card-title">{t("dimensions.title")}</h2>
            <p className="settings-card-intro">{t("dimensions.intro")}</p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")} disabled={customCount >= 10}>
              {t("dimensions.new")}
            </Button>
          )}
        </div>

        <div className="settings-card-body">
          {!isAdmin && <p className="settings-admin-hint mb-3">{t("dimensions.adminOnly")}</p>}
          {customCount >= 10 && isAdmin && <p className="mb-3 text-xs text-amber-600">{t("dimensions.limitReached")}</p>}

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
                    <span className={`type-badge${d.is_system ? " type-badge--system" : ""}`}>
                      {d.is_system ? t("dimensions.system") : t("dimensions.custom")}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="text-right">
                      <button type="button" className="settings-edit-link" onClick={() => setEditing(d)}>
                        {t("dimensions.edit")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    </div>
  );
}
