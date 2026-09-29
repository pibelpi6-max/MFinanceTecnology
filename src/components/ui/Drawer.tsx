"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  width = 400,
  children,
  footer,
}: DrawerProps) {
  const tt = useTranslations("common.tooltips");
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Controla montagem/desmontagem com animação
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double RAF: garante que o DOM seja pintado com o estado inicial
      // (translate-x-full + opacity-0) antes de ativar a transição
      let raf2: number;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2!) cancelAnimationFrame(raf2);
      };
    } else if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Esc fecha
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!mounted || typeof window === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={[
          "fixed inset-0 z-[100] bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ease-out",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-hidden
      />
      {/* Painel */}
      <div
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: width }}
        className={[
          "fixed right-0 top-0 z-[101] flex h-full w-full flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900",
          "transition-transform duration-300 ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
              )}
              {subtitle && (
                <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                  {subtitle}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              aria-label={tt("close")}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-4"><div className="pt-0">{children}</div></div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/50">
          {footer ?? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}