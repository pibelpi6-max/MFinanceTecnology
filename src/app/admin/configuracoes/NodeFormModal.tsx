"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TreeExpand, TreeGuides } from "@/components/ui/tree";
import { useTreeExpand } from "@/hooks/useTreeExpand";
import { buildDimensionHierarchy, getVisibleRows } from "@/lib/dimensions/hierarchy";
import { createDimensionNode, updateDimensionNode } from "../dimensoes/_actions";
import type { DimensionNodeRow } from "@/lib/dimensions/types";

interface NodeFormModalProps {
  open: boolean;
  onClose: () => void;
  editing: DimensionNodeRow | null;
  dimensionTypeId: string;
  dimensionTypeName: string;
  year: number;
  nodes: DimensionNodeRow[];
  onSaved: () => void;
}

export function NodeFormModal({
  open,
  onClose,
  editing,
  dimensionTypeId,
  dimensionTypeName,
  year,
  nodes,
  onSaved,
}: NodeFormModalProps) {
  const t = useTranslations("dimensions");
  const tc = useTranslations("common");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentNodeId, setParentNodeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? "");
    setName(editing?.name ?? "");
    setParentNodeId(editing?.parentNodeId ?? "");
    setError(null);
  }, [open, editing]);

  const parentOptions = useMemo(() => {
    if (!editing) return nodes.filter((n) => n.level < 10);

    const descendantIds = new Set<string>();
    const stack = [editing.id];
    while (stack.length) {
      const current = stack.pop()!;
      for (const n of nodes) {
        if (n.parentNodeId === current && !descendantIds.has(n.id)) {
          descendantIds.add(n.id);
          stack.push(n.id);
        }
      }
    }
    return nodes.filter(
      (n) => n.id !== editing.id && !descendantIds.has(n.id) && n.level < 10
    );
  }, [nodes, editing]);

  // Mesma hierarquia (ids/pais) de parentOptions -- como ela já exclui o nó
  // em edição e todos os seus descendentes, a subárvore restante continua
  // íntegra e dá pra construir a árvore direto em cima dela.
  const parentTree = useMemo(() => buildDimensionHierarchy(parentOptions), [parentOptions]);
  const parentExpand = useTreeExpand();
  const parentVisibleRows = useMemo(
    () => getVisibleRows(parentTree.rows, parentExpand.collapsedIds),
    [parentTree.rows, parentExpand.collapsedIds]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const parent = parentNodeId || null;
    const result = editing
      ? await updateDimensionNode({
          nodeId: editing.id,
          versionId: editing.versionId,
          currentValidFromYear: editing.validFromYear,
          name: name.trim(),
          parentNodeId: parent,
          year,
        })
      : await createDimensionNode({
          dimensionTypeId,
          code: code.trim(),
          name: name.trim(),
          parentNodeId: parent,
          year,
        });

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t("edit") : t("new")}
      subtitle={dimensionTypeName}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="node-form" isLoading={loading} loadingText={tc("saving")}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="node-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("code")}</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={!!editing}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{t("parent")}</label>
          <p className="mb-1.5 text-xs text-gray-400">{t("selectParentHint")}</p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1">
            <div
              className={`flex items-center gap-1 rounded-md px-1.5 py-1.5 ${
                parentNodeId === "" ? "bg-primary/10" : ""
              }`}
            >
              <span className="tree-expand-spacer" />
              <button
                type="button"
                onClick={() => setParentNodeId("")}
                className={`flex-1 truncate rounded px-1 py-0.5 text-left text-sm ${
                  parentNodeId === "" ? "font-semibold text-primary" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t("noParent")}
              </button>
            </div>
            {parentVisibleRows.map((row) => {
              const n = row.item;
              const selected = parentNodeId === n.id;
              return (
                <div
                  key={n.id}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-1 ${selected ? "bg-primary/10" : ""}`}
                >
                  <TreeGuides
                    ancestorContinues={row.ancestorContinues}
                    isLast={parentTree.isLastChild.has(n.id)}
                    depth={row.depth}
                  />
                  {parentTree.hasChildren.has(n.id) ? (
                    <TreeExpand
                      isOpen={!parentExpand.isCollapsed(n.id)}
                      onToggle={() => parentExpand.toggle(n.id)}
                      label={parentExpand.isCollapsed(n.id) ? t("expandNode") : t("collapseNode")}
                    />
                  ) : (
                    <span className="tree-expand-spacer" />
                  )}
                  <button
                    type="button"
                    onClick={() => setParentNodeId(n.id)}
                    className={`flex-1 truncate rounded px-1 py-0.5 text-left text-sm ${
                      selected ? "font-semibold text-primary" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {n.name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
