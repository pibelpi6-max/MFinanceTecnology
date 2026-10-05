"use client";

import { useTranslations } from "next-intl";
import type { ColumnMapping, ImportFieldConfig, ParsedSheet } from "@/lib/import/types";

interface ColumnMappingFieldsProps {
  sheet: ParsedSheet;
  fields: ImportFieldConfig[];
  mapping: ColumnMapping[];
  onChange: (columnIndex: number, targetKey: string | null) => void;
}

/**
 * Tabela plana: uma linha por coluna da planilha, com um seletor do
 * campo de destino e uma prévia dos 2 primeiros valores da coluna.
 * (O produto de referência agrupa isso em seções do formulário manual
 * para entidades com muitos campos — aqui optamos pela tabela única,
 * suficiente para os campos das 4 telas do MVP.)
 */
export function ColumnMappingFields({ sheet, fields, mapping, onChange }: ColumnMappingFieldsProps) {
  const t = useTranslations("import");

  return (
    <table className="import-mapping-table">
      <thead>
        <tr>
          <th>{t("mapping.column")}</th>
          <th>{t("mapping.preview")}</th>
          <th>{t("mapping.field")}</th>
        </tr>
      </thead>
      <tbody>
        {sheet.headers.map((header, columnIndex) => {
          const current = mapping.find((m) => m.columnIndex === columnIndex);
          const preview = sheet.rows
            .slice(0, 2)
            .map((row) => row[columnIndex])
            .filter(Boolean)
            .join(", ");
          return (
            <tr key={columnIndex}>
              <td className="import-mapping-header">{header}</td>
              <td className="import-mapping-preview">{preview || "—"}</td>
              <td>
                <select
                  value={current?.targetKey ?? ""}
                  onChange={(e) => onChange(columnIndex, e.target.value || null)}
                  className="import-mapping-select"
                >
                  <option value="">{t("mapping.ignoreColumn")}</option>
                  {fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
