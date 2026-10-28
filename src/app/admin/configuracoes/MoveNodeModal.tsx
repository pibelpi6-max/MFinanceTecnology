"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { DimensionNodeRow } from "@/lib/dimensions/types";

/** Itens para onde `node` pode ir: qualquer um da estrutura, menos ele mesmo, os de baixo e o pai atual. */
export function validMoveTargets(nodes: DimensionNodeRow[], node: DimensionNodeRow): DimensionNodeRow[] {
  const childrenOf = new Map<string, DimensionNodeRow[]>();
  for (const n of nodes) {
    if (!n.parentNodeId) continue;
    const list = childrenOf.get(n.parentNodeId) ?? [];
    list.push(n);
    childrenOf.set(n.parentNodeId, list);
  }
  const below: DimensionNodeRow[] = [];
  const stack = [...(childrenOf.get(node.id) ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    below.push(cur);
    stack.push(...(childrenOf.get(cur.id) ?? []));
  }
  const excluded = new Set([node.id, ...below.map((b) => b.id)]);
  const height = Math.max(node.level, ...below.map((b) => b.level)) - node.level; // níveis abaixo dele
  return nodes.filter((n) => !excluded.has(n.id) && n.id !== node.parentNodeId && n.level + 1 + height <= 10);
}

interface Props {
  open: boolean;
  onClose: () => void;
  node: DimensionNodeRow | null;
  nodes: DimensionNodeRow[];
  loading: boolean;
  error: string | null;
  onConfirm: (targetId: string) => void;
}

export function MoveNodeModal({ open, onClose, node, nodes, loading, error, onConfirm }: Props) {
  const t = useTranslations("dimensions");
  const tc = useTranslations("common");
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (open) setTarget(null);
  }, [open, node?.id]);

  const targets = useMemo(() => (node ? validMoveTargets(nodes, node) : []), [nodes, node]);
  const targetIds = useMemo(() => new Set(targets.map((x) => x.id)), [targets]);
  // Lista na ordem da árvore (pai antes dos filhos), mostrando todos para dar contexto,
  // mas só os alvos válidos são clicáveis.
  const ordered = useMemo(() => {
    const childrenOf = new Map<string | null, DimensionNodeRow[]>();
    for (const n of nodes) {
      const list = childrenOf.get(n.parentNodeId) ?? [];
      list.push(n);
      childrenOf.set(n.parentNodeId, list);
    }
    const out: DimensionNodeRow[] = [];
    const walk = (parent: string | null) => {
      for (const n of childrenOf.get(parent) ?? []) {
        out.push(n);
        walk(n.id);
      }
    };
    walk(null);
    return out;
  }, [nodes]);

  if (!node) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("moveTitle")}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>{tc("cancel")}</Button>
          <Button variant="primary" size="sm" isLoading={loading} disabled={!target} onClick={() => target && onConfirm(target)}>
            {t("moveConfirm")}
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-gray-600">{t("moveHint", { name: node.name })}</p>
      {targets.length === 0 ? (
        <p className="text-sm text-gray-500">{t("moveNoTargets")}</p>
      ) : (
        <ul className="move-node-list" role="listbox" aria-label={t("moveTitle")}>
          {ordered.map((n) => {
            const ok = targetIds.has(n.id);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={target === n.id}
                  disabled={!ok}
                  className={`move-node-item${target === n.id ? " is-selected" : ""}`}
                  style={{ paddingLeft: 12 + (n.level - 1) * 18 }}
                  onClick={() => setTarget(n.id)}
                >
                  {n.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Modal>
  );
}
