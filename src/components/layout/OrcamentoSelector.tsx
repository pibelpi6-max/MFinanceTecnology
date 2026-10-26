"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Orcamento } from "@/lib/orcamentos/types";

interface OrcamentoSelectorProps {
  orcamentos: Orcamento[];
  currentOrcamentoId: string | null;
}

/**
 * Indicador do Orçamento em uso, no topo de qualquer tela do admin. A
 * troca de orçamento acontece em Orçamentos (linha do tempo) — aqui só
 * mostramos qual está ativo e levamos de volta à área dele.
 */
export function OrcamentoSelector({ orcamentos, currentOrcamentoId }: OrcamentoSelectorProps) {
  const t = useTranslations("orcamentos");
  const current = orcamentos.find((o) => o.id === currentOrcamentoId) ?? null;

  return (
    <Link
      href={current ? `/admin/orcamentos/${current.id}` : "/admin/orcamentos"}
      className="orcamento-chip"
      title={t("chipTitle")}
    >
      {current?.oficial && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="#F5B301" aria-hidden="true">
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z" />
        </svg>
      )}
      <span className="orcamento-chip-label">{current ? `${current.year} · ${current.label}` : t("chipNone")}</span>
    </Link>
  );
}
