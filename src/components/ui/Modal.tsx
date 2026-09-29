"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: string;
  /** Tamanhos: sm=480px, md=640px, lg=720px, xl=900px, full=92vw, screen=quase tela cheia (96vw x 90vh) */
  size?: "sm" | "md" | "lg" | "xl" | "full" | "screen";
  /** Footer customizado (botões de ação). Se omitido, modal não tem footer. */
  footer?: React.ReactNode;
  /** Classe extra no body (ex: "p-0 overflow-hidden" para forms com scroll próprio) */
  bodyClassName?: string;
  /** Modal compacto: sem header, largura menor, altura automática (ex: tela de sucesso) */
  compact?: boolean;
  /** Quando true, o modal ocupa 100% da tela -- sem backdrop visivel, sem cantos, sem moldura (ex: ao entrar em fullscreen nativo). */
  fullBleed?: boolean;
  /** Quando true, a altura do modal se ajusta ao conteudo (a largura continua fixada pelo "size"). Use em modais de conteudo curto ou variavel que nao devem deixar espaco vazio embaixo. */
  autoHeight?: boolean;
  children: React.ReactNode;
}

const SIZE_CLASSES = {
  sm: "max-w-[480px]",
  md: "max-w-[640px]",
  lg: "max-w-[700px]",
  xl: "max-w-[900px]",
  full: "max-w-[92vw]",
  screen: "max-w-[96vw]",
} as const;

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = "lg",
  footer,
  bodyClassName,
  compact = false,
  fullBleed = false,
  autoHeight = false,
  children,
}: ModalProps) {
  const tt = useTranslations("common.tooltips");
  const containerRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);

  // Efeito de entrada: comeca compacto e expande no frame seguinte
  useEffect(() => {
    if (!open) { setEntered(false); return; }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Fecha com ESC
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Trava o scroll do body enquanto modal aberto
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;
  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[100] flex items-center justify-center ${fullBleed ? "p-0" : "p-4"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      {/* Backdrop com blur */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 ${fullBleed ? "opacity-0" : ""}`}
        aria-hidden="true"
      />

      {/* Modal container */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={[
            [
              "relative z-10 flex w-full flex-col overflow-hidden bg-white transition-all ease-out",
              fullBleed ? "" : "rounded-xl border border-gray-200 shadow-2xl",
              size === "screen" ? "duration-500" : "duration-300",
              fullBleed ? "h-screen" : (compact ? "" : (size === "sm" || autoHeight) ? "" : entered ? (size === "screen" ? "h-[90vh]" : "h-[520px]") : "h-[400px]"),
            ].join(" "),
            "dark:border-gray-800 dark:bg-gray-900",
            fullBleed ? "max-w-none w-screen" : ((compact || !entered) ? "max-w-[440px]" : SIZE_CLASSES[size]),
          ].join(" ")}
        >
        {/* Header */}
        {!compact && (title || subtitle) && (
          <div className="flex items-start justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
            <div>
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-bold text-[var(--text-strong)]"
                >
                  {title}
                </h2>
              )}
              {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              aria-label={tt("close")}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

          {/* Body — overflow-y-auto permite scroll interno quando conteúdo exceder a altura */}
          <div
            className={
              compact
                ? "flex flex-1 items-center justify-center px-6 py-8"
                : bodyClassName
                  ? bodyClassName
                  : "flex-1 min-h-0 overflow-y-auto px-6 pb-4 pt-4"
            }
          >
            {children}
          </div>

        {/* Footer (opcional) */}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}