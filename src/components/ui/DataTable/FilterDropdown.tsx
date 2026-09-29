"use client";

import { useState, useEffect, useRef } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ColumnMeta } from "./types";

interface FilterDropdownProps<T> {
  open: boolean;
  position: { top: number; left: number } | null;
  column: ColumnMeta<T>;
  options: Array<[string, number]>;
  pendingSelection: Set<string>;
  onTogglePending: (val: string) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function FilterDropdown<T>({
  open,
  position,
  column,
  options,
  pendingSelection,
  onTogglePending,
  onApply,
  onClear,
  onClose,
}: FilterDropdownProps<T>) {
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open || !position) return null;

  const labelFor = (val: string) => column.filterValueLabels?.[val] ?? val;

  const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const strip = (v: string) => v.replace(/[()\-\/\.\s]/g, "");
  const filtered = options.filter(([val]) => {
    const label = labelFor(val);
    const q = norm(search);
    return norm(label).includes(q) || strip(norm(label)).includes(strip(q));
  });

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: position.top - 1,
        left: position.left,
        zIndex: 50,
        width: 220,
        borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      }}
      className="border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
    >
      {/* Campo de busca */}
      <div className="border-b border-gray-100 px-2 py-1.5 dark:border-gray-800">
        <input
          type="text"
          placeholder="Buscar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 placeholder-gray-400 focus:border-[#5cb88a] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:placeholder-gray-500"
        />
      </div>

      {/* Contador de selecionados + Limpar */}
      {pendingSelection.size > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xs text-[#5cb88a]">
            {pendingSelection.size}{" "}
            {pendingSelection.size === 1 ? "selecionado" : "selecionados"}
          </span>
          <button
            onClick={onClear}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Lista de opções */}
      <div style={{ maxHeight: "180px", overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-400">Sem opções</p>
        ) : (
          filtered.map(([val, count]) => {
            const on = pendingSelection.has(val);
            return (
              <button
                key={val}
                type="button"
                onClick={() => onTogglePending(val)}
                className={[
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                  on
                    ? "bg-[#5cb88a]/5 text-gray-800 dark:text-gray-200"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                    on
                      ? "border-[#5cb88a] bg-[#5cb88a]"
                      : "border-gray-300 dark:border-gray-600",
                  ].join(" ")}
                >
                  {on && (
                    <svg
                      className="h-2.5 w-2.5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  )}
                </span>
                <Tooltip text={labelFor(val)} side="top">
                  <span className="block truncate flex-1">{labelFor(val)}</span>
                </Tooltip>
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                  {count}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Botão Aplicar */}
      <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-800">
        <button
          type="button"
          onClick={onApply}
          className="w-full rounded-lg bg-[#5cb88a] px-3 py-1 text-xs font-medium text-white transition hover:bg-[#4aa678]"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
