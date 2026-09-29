"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { ColumnMeta, RowMeta } from "@/components/ui/DataTable/types";
import type { DimensionNodeRow } from "@/lib/dimensions/types";
import { NodeFormModal } from "./NodeFormModal";
import { cancelDimensionNode } from "../_actions";

interface DimensionTreeClientProps {
  dimensionTypeId: string;
  dimensionTypeName: string;
  year: number;
  nodes: DimensionNodeRow[];
}

function buildHierarchy(nodes: DimensionNodeRow[]) {
  const byParent = new Map<string | null, DimensionNodeRow[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentNodeId) ?? [];
    list.push(n);
    byParent.set(n.parentNodeId, list);
  }
  byParent.forEach((list) => {
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });

  const rows: RowMeta<DimensionNodeRow>[] = [];
  const depthByNodeId = new Map<string, number>();

  function walk(parentId: string | null, depth: number) {
    for (const n of byParent.get(parentId) ?? []) {
      rows.push({ item: n, depth });
      depthByNodeId.set(n.id, depth);
      walk(n.id, depth + 1);
    }
  }
  walk(null, 0);

  return { rows, depthByNodeId };
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

  const { rows, depthByNodeId } = useMemo(() => buildHierarchy(nodes), [nodes]);

  const columns: ColumnMeta<DimensionNodeRow>[] = useMemo(
    () => [
      {
        key: "name",
        label: t("name"),
        getText: (n) => n.name,
        render: (n) => {
          const depth = depthByNodeId.get(n.id) ?? 0;
          return (
            <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
              {depth > 0 && <span className="text-gray-300">└</span>}
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
    [t, depthByNodeId]
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
        buildTree={() => rows}
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
