"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Drawer } from "@/components/ui/Drawer";
import { fetchPackageHistory } from "./_actions";
import type { BudgetPackageRow, PackageStatusHistoryRow } from "@/lib/packages/types";

interface PackageHistoryDrawerProps {
  pkg: BudgetPackageRow | null;
  onClose: () => void;
  currentUserId: string;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function PackageHistoryDrawer({ pkg, onClose, currentUserId }: PackageHistoryDrawerProps) {
  const t = useTranslations("packages");
  const [rows, setRows] = useState<PackageStatusHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pkg) {
      setRows(null);
      return;
    }
    setRows(null);
    setError(null);
    fetchPackageHistory(pkg.id).then((result) => {
      if (result.error) setError(result.error);
      else setRows(result.data ?? []);
    });
  }, [pkg]);

  return (
    <Drawer open={pkg !== null} onClose={onClose} title={t("historyTitle")} subtitle={pkg?.name} width={380}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows === null && !error && <p className="text-sm text-gray-400">{t("loading")}</p>}
      {rows !== null && rows.length === 0 && <p className="text-sm text-gray-400">{t("historyEmpty")}</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="border-l-2 border-gray-200 pl-3">
              <p className="text-sm font-medium text-gray-800">
                {row.fromStatus ? `${t(`statusValues.${row.fromStatus}`)} → ` : ""}
                {t(`statusValues.${row.toStatus}`)}
              </p>
              <p className="text-xs text-gray-500">
                {dateFormatter.format(new Date(row.createdAt))}
                {row.changedByUserId === currentUserId ? ` · ${t("byYou")}` : ""}
              </p>
              {row.comment && <p className="mt-1 text-xs text-gray-600">{row.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
