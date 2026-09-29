"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface MatrixFiltersProps {
  year: number;
  month: number;
  entityNodeId: string;
  entities: { id: string; name: string }[];
}

const MONTH_KEYS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function MatrixFilters({ year, month, entityNodeId, entities }: MatrixFiltersProps) {
  const router = useRouter();
  const t = useTranslations("budget");
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);
  if (!years.includes(year)) years.unshift(year);
  years.sort((a, b) => a - b);

  function update(next: Partial<{ ano: number; mes: number; entidade: string }>) {
    const params = new URLSearchParams({
      ano: String(next.ano ?? year),
      mes: String(next.mes ?? month),
      entidade: next.entidade ?? entityNodeId,
    });
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
