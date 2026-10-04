"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface ExtraDimensionSelection {
  /** Código da dimensão (ex: "projeto") — usado como chave do searchParam na URL. */
  code: string;
  name: string;
  nodeId: string;
  options: { id: string; name: string }[];
}

interface MatrixFiltersProps {
  year: number;
  month: number;
  entityNodeId: string;
  entities: { id: string; name: string }[];
  /** Eixos extras ativos (dimensões marcadas no módulo da Matriz — ver Parâmetros). */
  extraSelections: ExtraDimensionSelection[];
}

const MONTH_KEYS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function MatrixFilters({ year, month, entityNodeId, entities, extraSelections }: MatrixFiltersProps) {
  const router = useRouter();
  const t = useTranslations("budget");
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);
  if (!years.includes(year)) years.unshift(year);
  years.sort((a, b) => a - b);

  function update(overrides: Record<string, string | number>) {
    const current: Record<string, string> = {
      ano: String(year),
      mes: String(month),
      entidade: entityNodeId,
    };
    for (const sel of extraSelections) current[sel.code] = sel.nodeId;

    const merged = { ...current };
    for (const [key, value] of Object.entries(overrides)) merged[key] = String(value);

    const params = new URLSearchParams(merged);
    router.push(`/admin/orcamento/matriz?${params.toString()}`);
  }

  return (
    <div className="matrix-filters">
      {entities.length > 1 && (
        <select
          className="year-select"
          value={entityNodeId}
          onChange={(e) => update({ entidade: e.target.value })}
          title={t("entity")}
        >
          {entities.map((ent) => (
            <option key={ent.id} value={ent.id}>
              {ent.name}
            </option>
          ))}
        </select>
      )}
      {extraSelections.map(
        (sel) =>
          sel.options.length > 1 && (
            <select
              key={sel.code}
              className="year-select"
              value={sel.nodeId}
              onChange={(e) => update({ [sel.code]: e.target.value })}
              title={sel.name}
            >
              {sel.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )
      )}
      <select
        className="year-select"
        value={month}
        onChange={(e) => update({ mes: Number(e.target.value) })}
      >
        {MONTH_KEYS.map((key, i) => (
          <option key={key} value={i + 1}>
            {t(`months.${key}`)}
          </option>
        ))}
      </select>
      <select
        className="year-select"
        value={year}
        onChange={(e) => update({ ano: Number(e.target.value) })}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
