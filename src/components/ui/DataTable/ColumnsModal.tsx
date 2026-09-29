"use client";

function norm(v: string) { return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }


import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import type { ColumnMeta, ColPref } from "./types";

interface ColumnsModalProps<T> {
  open: boolean;
  onClose: () => void;
  columns: ColumnMeta<T>[];
  colState: ColPref[];
  onToggle: (key: string) => void;
  onReorder: (fromKey: string, toKey: string) => void;
}

const GRIP = (
  <>
    <circle cx="9" cy="5" r="1.5" />
    <circle cx="15" cy="5" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="19" r="1.5" />
    <circle cx="15" cy="19" r="1.5" />
  </>
);

export function ColumnsModal<T>({
  open,
  onClose,
  columns,
  colState,
  onToggle,
  onReorder,
}: ColumnsModalProps<T>) {
  const tcol = useTranslations("common.columns");
  const tc = useTranslations("common");
  const [search, setSearch] = useState("");

  // Drag (mouse events + ghost flutuante)
  const dragKeyRef = useRef<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [ghostLabel, setGhostLabel] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  });

  // Ordem visível atual sempre acessível dentro dos handlers
  const visibleKeysRef = useRef<string[]>([]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const ALL_COL_KEYS = new Set(columns.map((c) => c.key));
  const visibleItems = colState.filter((c) => c.on && ALL_COL_KEYS.has(c.key));
  const hiddenItems = colState.filter((c) => !c.on && ALL_COL_KEYS.has(c.key));

  visibleKeysRef.current = visibleItems.map((c) => c.key);

  const onGripMouseDown = (e: React.MouseEvent, key: string, label: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rowEl = (e.currentTarget as HTMLElement).closest("[data-col-key]") as HTMLElement | null;
    if (!rowEl) return;
    const rect = rowEl.getBoundingClientRect();

    dragKeyRef.current = key;
    setDraggingKey(key);
    setGhostLabel(label);
    setGhostPos({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });

    const startMouseY = e.clientY;
    const startTop = rect.top;
    const fixedLeft = rect.left;
    let prevMouseY = e.clientY;
    let lastTarget: string | null = null;

    const onMove = (ev: MouseEvent) => {
      setGhostPos((p) => ({ ...p, x: fixedLeft, y: startTop + (ev.clientY - startMouseY) }));

      const movingDown = ev.clientY > prevMouseY;
      const movingUp = ev.clientY < prevMouseY;
      prevMouseY = ev.clientY;

      const rows = document.querySelectorAll("[data-col-key]") as NodeListOf<HTMLElement>;
      let targetKey: string | null = null;

      rows.forEach((row) => {
        const id = row.dataset.colKey;
        if (!id || id === dragKeyRef.current) return;
        const r = row.getBoundingClientRect();
        const keys = visibleKeysRef.current;
        const dragIdx = keys.indexOf(dragKeyRef.current!);
        const targetIdx = keys.indexOf(id);
        if (dragIdx === -1 || targetIdx === -1) return;
        if (movingDown && targetIdx > dragIdx && ev.clientY >= r.top + 16) targetKey = id;
        if (movingUp && targetIdx < dragIdx && ev.clientY <= r.bottom - 16) targetKey = id;
      });

      if (targetKey !== null && targetKey !== lastTarget) {
        lastTarget = targetKey;
        if (dragKeyRef.current) onReorder(dragKeyRef.current, targetKey);
      } else if (targetKey === null) {
        lastTarget = null;
      }
    };

    const onUp = () => {
      dragKeyRef.current = null;
      setDraggingKey(null);
      setGhostLabel(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tcol("title")}
      subtitle={tcol("subtitle")}
      size="sm"
    >
      <div className="flex flex-col" style={{ height: 420 }}>
        {/* Campo busca (filtra apenas disponíveis) */}
        <div className="relative -mt-2 mb-2 shrink-0">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tc("search")}
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-700 placeholder-gray-400 focus:border-[#5cb88a] focus:outline-none focus:ring-2 focus:ring-[#5cb88a]/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:placeholder-gray-500"
          />
        </div>

        {/* Lista com scroll interno */}
        <div className="flex-1 overflow-y-auto pr-1">
          {(() => {
            const q = norm(search.trim());
            const matchVisible = !q
              ? visibleItems
              : visibleItems.filter((c) => {
                  const meta = columns.find((m) => m.key === c.key);
                  return norm(meta?.label ?? '').includes(q) ?? false;
                });
            const matchHidden = !q
              ? hiddenItems
              : hiddenItems.filter((c) => {
                  const meta = columns.find((m) => m.key === c.key);
                  return norm(meta?.label ?? '').includes(q) ?? false;
                });

            function groupBySection<T extends { key: string }>(list: T[]) {
              const groups: { section: string; items: T[] }[] = [];
              for (const c of list) {
                const meta = columns.find((m) => m.key === c.key);
                const sec = meta?.section ?? "";
                const existing = groups.find((g) => g.section === sec);
                if (existing) existing.items.push(c);
                else groups.push({ section: sec, items: [c] });
              }
              return groups;
            }

            const visGroups = groupBySection(matchVisible);
            const hidGroups = groupBySection(matchHidden);

            const SectionLabel = ({ label }: { label: string }) => {
              if (!label) return null;
              const translated = (() => { try { return tcol(`sections.${label}`); } catch { return label; } })();
              return (
                <p className="mt-2 mb-0.5 px-1 text-[9px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-600">
                  {translated}
                </p>
              );
            };

            return (
              <>
                {matchVisible.length > 0 && (
                  <>
                    <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-[#0F6E56] dark:text-[#5cb88a]">
                      Visíveis
                    </p>
                    {visGroups.map(({ section, items }) => (
                      <div key={section}>
                        {items.map((c) => {
                          const meta = columns.find((m) => m.key === c.key)!;
                          const isDragging = draggingKey === c.key;
                          const isAffected = ghostLabel !== null && !isDragging;
                          return (
                            <div
                              key={c.key}
                              data-col-key={c.key}
                              className={[
                                "flex items-center gap-3 rounded-lg border px-2 py-2 select-none transition-colors duration-150",
                                isAffected
                                  ? "border-[rgba(29,158,117,0.2)] bg-[rgba(29,158,117,0.07)]"
                                  : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800",
                              ].join(" ")}
                              style={{ visibility: isDragging ? "hidden" : "visible" }}
                            >
                              <span
                                onMouseDown={(e) => onGripMouseDown(e, c.key, meta.label)}
                                className="inline-flex shrink-0 cursor-grab items-center active:cursor-grabbing"
                                aria-label={`Arrastar ${meta.label}`}
                              >
                                <svg className="h-2.5 w-2.5 text-gray-400 transition-colors hover:text-[#5cb88a]" fill="currentColor" viewBox="0 0 24 24">{GRIP}</svg>
                              </span>
                              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{meta.label}</span>
                              <button type="button" onClick={() => onToggle(c.key)} aria-label={`Ocultar ${meta.label}`}
                                style={{ width: 28, height: 16, borderRadius: 8, border: "none", cursor: "pointer", background: "#5cb88a", position: "relative", flexShrink: 0 }}>
                                <span style={{ position: "absolute", width: 12, height: 12, borderRadius: "50%", background: "#fff", top: 2, left: 14, transition: "left 0.2s" }} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </>
                )}

                <div className="my-2 border-t border-gray-100 dark:border-gray-800" />
                <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-[#0F6E56] dark:text-[#5cb88a]">
                  Disponíveis
                </p>
                {matchHidden.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-gray-400 dark:text-gray-500">
                    {q ? tcol("noMatch") : tcol("allVisible")}
                  </p>
                ) : (
                  hidGroups.map(({ section, items }) => (
                    <div key={section}>
                      <SectionLabel label={section} />
                      {items.map((c) => {
                        const meta = columns.find((m) => m.key === c.key)!;
                        return (
                          <div key={c.key} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                            <svg className="h-2.5 w-2.5 shrink-0 text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 24 24">{GRIP}</svg>
                            <span className="flex-1 text-sm text-gray-400 dark:text-gray-500">{meta.label}</span>
                            <button type="button" onClick={() => { onToggle(c.key); setSearch(""); }} aria-label={`Mostrar ${meta.label}`}
                              style={{ width: 28, height: 16, borderRadius: 8, border: "none", cursor: "pointer", background: "#d1d5db", position: "relative", flexShrink: 0 }}>
                              <span style={{ position: "absolute", width: 12, height: 12, borderRadius: "50%", background: "#fff", top: 2, left: 2, transition: "left 0.2s" }} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Ghost flutuante */}
      {ghostLabel &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: ghostPos.y,
              left: ghostPos.x,
              width: ghostPos.w,
              height: ghostPos.h,
              pointerEvents: "none",
              zIndex: 9999,
              background: "rgba(29,158,117,0.08)",
              borderLeft: "2px solid rgba(29,158,117,0.5)",
              borderRight: "2px solid rgba(29,158,117,0.5)",
              borderRadius: 4,
              padding: "0 8px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              boxSizing: "border-box",
            }}
          >
            <span style={{ color: "#5cb88a", flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
              <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24">
                {GRIP}
              </svg>
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "rgba(29,158,117,0.7)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {ghostLabel}
            </span>
          </div>,
          document.body,
        )}
    </Modal>
  );
}
