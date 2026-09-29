"use client";
import { useState, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  side?: "top" | "bottom";
  children: React.ReactNode;
  onlyWhenTruncated?: boolean;
  fullWidth?: boolean;
  multiline?: boolean;
}

export function Tooltip({ text, side = "top", children, onlyWhenTruncated = false, fullWidth = false, multiline = false }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  const isTruncated = useCallback(() => {
    if (!onlyWhenTruncated) return true;
    const root = wrapperRef.current?.querySelector("[data-truncate]") as HTMLElement | null;
    if (!root) return false;
    // Escaneia o próprio root e todos os descendentes
    const candidates = [root, ...Array.from(root.querySelectorAll("*"))] as HTMLElement[];
    for (const el of candidates) {
      if (el.scrollWidth > el.clientWidth) return true;
    }
    return false;
  }, [onlyWhenTruncated]);

  function handleEnter() {
    timeoutRef.current = setTimeout(() => {
      if (!isTruncated()) return;
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({
        x: rect.left,
        y: side === "top" ? rect.top - 6 : rect.bottom + 6,
      });
    }, 200);
  }

  function handleLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPos(null);
  }

  // Após renderizar o tooltip, mede a largura e ajusta x se vazar da viewport
  useLayoutEffect(() => {
    if (!pos || !tooltipRef.current) return;
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const margin = 8; // respiro até a borda
    let newX = pos.x;
    if (newX + tooltipRect.width + margin > viewportWidth) {
      newX = viewportWidth - tooltipRect.width - margin;
    }
    if (newX < margin) newX = margin;
    if (newX !== pos.x) setPos({ x: newX, y: pos.y });
  }, [pos]);

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-flex min-w-0 ${fullWidth ? "w-full" : "max-w-full"}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {pos && text && text !== "—" && typeof window !== "undefined" && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "fixed",
            left: pos.x,
            ...(side === "top" ? { bottom: window.innerHeight - pos.y } : { top: pos.y }),
            zIndex: 99999,
            pointerEvents: "none",
          }}
          className={`max-w-sm rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-gray-700 ${multiline ? "whitespace-pre-line" : "whitespace-nowrap"}`}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}