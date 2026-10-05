"use client";

import { ChevronRight } from "lucide-react";

/**
 * Botão de expandir/colapsar genérico para qualquer árvore (dimensões,
 * seletor de pai, painel de entidades na Matriz). Sempre para de propagar
 * o clique para não disparar o onClick da própria linha (ex.: abrir modal
 * de edição, selecionar o nó).
 *
 * Portado do padrão usado em outro projeto (desenhe-app /
 * src/components/academico/tree/TreeExpand.tsx).
 */
export function TreeExpand({
  isOpen,
  onToggle,
  className,
  label,
}: {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={["tree-expand-btn", isOpen ? "is-open" : "", className].filter(Boolean).join(" ")}
      aria-expanded={isOpen}
      aria-label={label || (isOpen ? "Recolher" : "Expandir")}
      title={label}
    >
      <ChevronRight size={13} />
    </button>
  );
}
