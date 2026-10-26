import Link from "next/link";

/** Volta ao mapa de módulos do orçamento (usado no topo de cada módulo). */
export function BackToMapLink({ orcamentoId, label }: { orcamentoId: string; label: string }) {
  return (
    <Link href={`/admin/orcamentos/${orcamentoId}`} className="orc-back-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </Link>
  );
}
