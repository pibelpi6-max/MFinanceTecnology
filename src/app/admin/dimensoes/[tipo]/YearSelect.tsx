"use client";

import { useRouter } from "next/navigation";

interface YearSelectProps {
  year: number;
  tipo: string;
}

export function YearSelect({ year, tipo }: YearSelectProps) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);
  if (!years.includes(year)) years.unshift(year);
  years.sort((a, b) => a - b);

  return (
    <select
      className="year-select"
      value={year}
      onChange={(e) => router.push(`/admin/dimensoes/${tipo}?ano=${e.target.value}`)}
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
