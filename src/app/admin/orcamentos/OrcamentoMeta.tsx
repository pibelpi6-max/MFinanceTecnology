import type { OrcamentoStatus, OrcamentoTipo } from "@/lib/orcamentos/types";

export function OficialStar({ title }: { title: string }) {
  return (
    <span className="orc-star" title={title} aria-label={title}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z" />
      </svg>
    </span>
  );
}

export function TipoLabel({ tipo, label }: { tipo: OrcamentoTipo; label: string }) {
  return <span className={`orc-tipo orc-tipo-${tipo}`}>{label}</span>;
}

export function StatusPill({ status, label }: { status: OrcamentoStatus; label: string }) {
  return <span className={`orc-status orc-status-${status}`}>{label}</span>;
}
