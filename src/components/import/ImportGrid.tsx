"use client";

import { useTranslations } from "next-intl";
import type { ImportFieldConfig, ImportRowResult } from "@/lib/import/types";

interface ImportGridProps {
  rows: ImportRowResult[];
  fields: ImportFieldConfig[];
  onToggleSkip: (rowIndex: number) => void;
}

/**
 * Grade de revisão: mostra todas as linhas de uma vez (erros de todas
 * elas, não só a primeira) para o usuário corrigir tudo numa passada.
 * V1 não edita células aqui — quem tiver erro corrige a planilha de
 * origem e reimporta; dá pra "pular" (skip) uma linha problemática sem
 * travar a importação das demais.
 */
export function ImportGrid({ rows, fields, onToggleSkip }: ImportGridProps) {
  const t = useTranslations("import");

  return (
    <div className="import-grid-wrap">
      <table className="import-grid-table">
        <thead>
          <tr>
            <th></th>
            <th>#</th>
            {fields.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
            <th>{t("review.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasErrors = Object.keys(row.errors).length > 0;
            return (
              <tr
                key={row.rowIndex}
                className={row.skip ? "import-row-skipped" : hasErrors ? "import-row-error" : ""}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={!row.skip}
                    onChange={() => onToggleSkip(row.rowIndex)}
                    title={t("review.includeRow")}
                  />
                </td>
                <td>{row.rowIndex + 1}</td>
                {fields.map((f) => (
                  <td key={f.key} title={row.errors[f.key] ?? ""}>
                    {row.rawValues[f.key] || "—"}
                    {row.errors[f.key] && <div className="import-cell-error">{row.errors[f.key]}</div>}
                  </td>
                ))}
                <td>
                  {row.skip ? (
                    <span className="import-status-tag import-status-skipped">{t("review.skipped")}</span>
                  ) : hasErrors ? (
                    <span className="import-status-tag import-status-error">{t("review.hasErrors")}</span>
                  ) : (
                    <span className="import-status-tag import-status-ok">{t("review.ready")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
