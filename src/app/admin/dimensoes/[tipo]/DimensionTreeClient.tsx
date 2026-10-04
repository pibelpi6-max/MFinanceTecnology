"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TreeExpand, TreeGuides } from "@/components/ui/tree";
import { useTreeExpand } from "@/hooks/useTreeExpand";
import type { ColumnMeta } from "@/components/ui/DataTable/types";
import type { DimensionNodeRow } from "@/lib/dimensions/types";
import { buildDimensionHierarchy, getVisibleRows } from "@/lib/dimensions/hierarchy";
import { NodeFormModal } from "./NodeFormModal";
import { cancelDimensionNode } from "../_actions";

interface DimensionTreeClientProps {
  dimensionTypeId: string;
  dimensionTypeName: string;
  year: number;
  nodes: DimensionNodeRow[];
}

export function DimensionTreeClient({
  dimensionTypeId,
  dimensionTypeName,
  year,
  nodes,
}: DimensionTreeClientProps) {
  const router = useRouter();
  const t = useTranslations("dimensions");
  const tc = useTranslations("common");

  const [editing, setEditing] = useState<DimensionNodeRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<DimensionNodeRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const hierarchy = useMemo(() => buildDimensionHierarchy(nodes), [nodes]);
  const { depthByNodeId, hasChildren, isLastChild, rows } = hierarchy;
  const rowById = useMemo(() => new Map(rows.map((r) => [r.item.id, r])), [rows]);

  const { collapsedIds, isCollapsed, toggle } = useTreeExpand();
  const visibleRows = useMemo(() => getVisibleRows(rows, collapsedIds), [rows, collapsedIds]);

  const columns: ColumnMeta<DimensionNodeRow>[] = useMemo(
    () => [
      {
        key: "name",
        label: t("name"),
        getText: (n) => n.name,
        render: (n) => {
          const depth = depthByNodeId.get(n.id) ?? 0;
          const row = rowById.get(n.id);
          return (
            <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: 4 }}>
              {row && <TreeGuides ancestorContinues={row.ancestorContinues} isLast={isLastChild.has(n.id)} depth={depth} />}
              {hasChildren.has(n.id) ? (
                <TreeExpand
                  isOpen={!isCollapsed(n.id)}
                  onToggle={() => toggle(n.id)}
                  label={isCollapsed(n.id) ? t("expandNode") : t("collapseNode")}
                />
              ) : (
                <span className="tree-expand-spacer" />
              )}
              <span className="truncate font-medium text-gray-800">{n.name}</span>
            </div>
          );
        },
      },
      {
        key: "code",
        label: t("code"),
        width: 140,
        getText: (n) => n.code,
        render: (n) => <span className="font-mono text-xs text-gray-500">{n.code}</span>,
      },
      {
        key: "validFrom",
        label: t("validFrom"),
        width: 170,
        align: "right",
        noTooltip: true,
        render: (n) => (
          <span className="text-xs text-gray-400">{t("activeFrom", { year: n.validFromYear })}</span>
        ),
      },
    ],
    [t, depthByNodeId, rowById, hasChildren, isLastChild, isCollapsed, toggle]
  );

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await cancelDimensionNode({ versionId: deleting.versionId, year });
    setDeleteLoading(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <DataTable<DimensionNodeRow>
        items={nodes}
        columns={columns}
        prefsKey={`dimensoes_${dimensionTypeId}_cols`}
        onEdit={(n) => setEditing(n)}
        onDelete={(n) => setDeleting(n)}
        onNew={() => setEditing("new")}
        newLabel={t("new")}
        emptyMessage={t("emptyMessage", { year })}
        buildTree={() => visibleRows}
      />

      <NodeFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        editing={editing === "new" ? null : editing}
        dimensionTypeId={dimensionTypeId}
        dimensionTypeName={dimensionTypeName}
        year={year}
        nodes={nodes}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <Modal
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        title={t("deleteConfirmTitle")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteLoading}>
              {tc("cancel")}
            </Button>
            <Button
              variant="danger"
              isLoading={deleteLoading}
              loadingText={tc("saving")}
              onClick={handleConfirmDelete}
            >
              {tc("delete")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {deleting && t("deleteConfirmBody", { name: deleting.name, year })}
          </p>
          {deleteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{deleteError}</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
