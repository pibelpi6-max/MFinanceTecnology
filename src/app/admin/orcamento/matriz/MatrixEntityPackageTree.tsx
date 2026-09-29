"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { HierarchyRow } from "@/lib/dimensions/hierarchy";
import type { DimensionNodeRow } from "@/lib/dimensions/types";
import type { BudgetPackageRow, PackageStatus } from "@/lib/packages/types";

interface MatrixEntityPackageTreeProps {
  year: number;
  month: number;
  entityRows: HierarchyRow<DimensionNodeRow>[];
  selectedEntityId: string;
  packages: BudgetPackageRow[];
  packageLabelPlural: string;
}

const STATUS_DOT: Record<PackageStatus, string> = {
  rascunho: "#9aa0ad",
  em_elaboracao: "#3E6FE0",
  submetido: "#b45309",
  aprovado: "#15803d",
  rejeitado: "#dc2626",
};

export function MatrixEntityPackageTree({
  year,
  month,
  entityRows,
  selectedEntityId,
  packages,
  packageLabelPlural,
}: MatrixEntityPackageTreeProps) {
  const router = useRouter();
  const t = useTranslations("budget.tree");
  const [open, setOpen] = useState(true);

  const packagesByEntity = useMemo(() => {
    const map = new Map<string, BudgetPackageRow[]>();
    const others: BudgetPackageRow[] = [];
    for (const pkg of packages) {
      if (pkg.entityNodeId) {
        const list = map.get(pkg.entityNodeId) ?? [];
        list.push(pkg);
        map.set(pkg.entityNodeId, list);
      } else {
        others.push(pkg);
      }
    }
    return { map, others };
  }, [packages]);

  function selectEntity(entityId: string) {
    const params = new URLSearchParams({ ano: String(year), mes: String(month), entidade: entityId });
    router.push(`/admin/orcamento/matriz?${params.toString()}`);
  }

  function goToPackage() {
    router.push(`/admin/pacotes?ano=${year}`);
  }

  if (!open) {
    return (
      <div className="matrix-tree-panel matrix-tree-collapsed">
        <button type="button" className="matrix-tree-toggle-btn" onClick={() => setOpen(true)} title={t("show")}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="matrix-tree-panel">
      <div className="matrix-tree-header">
        <span className="matrix-tree-title">{t("title", { packages: packageLabelPlural })}</span>
        <button type="button" className="matrix-tree-toggle-btn" onClick={() => setOpen(false)} title={t("hide")}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 4.5l-7.5 7.5 7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="matrix-tree-body">
        {entityRows.map((row) => {
          const entityPackages = packagesByEntity.map.get(row.item.id) ?? [];
          return (
            <div key={row.item.id}>
              <button
                type="button"
                className={`matrix-tree-entity${row.item.id === selectedEntityId ? " active" : ""}`}
                style={{ paddingLeft: 8 + row.depth * 14 }}
                onClick={() => selectEntity(row.item.id)}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} style={{ flexShrink: 0, opacity: 0.6 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h9v18m6-13.5h-6M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m4.5 4.5v-4.5" />
                </svg>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.item.name}</span>
              </button>
              {entityPackages.length > 0 && (
                <div className="matrix-tree-packages" style={{ paddingLeft: 8 + row.depth * 14 + 18 }}>
                  {entityPackages.map((pkg) => (
                    <button key={pkg.id} type="button" className="matrix-tree-package" onClick={goToPackage} title={t("goToPackages")}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_DOT[pkg.status], flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pkg.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <p className="matrix-tree-section-label">{t("otherPackages", { packages: packageLabelPlural })}</p>
        {packagesByEntity.others.length === 0 ? (
          <p className="matrix-tree-empty">{t("noPackages", { year })}</p>
        ) : (
          <div className="matrix-tree-packages" style={{ paddingLeft: 8 }}>
            {packagesByEntity.others.map((pkg) => (
              <button key={pkg.id} type="button" className="matrix-tree-package" onClick={goToPackage} title={t("goToPackages")}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_DOT[pkg.status], flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pkg.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
