"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setOrcamentoAtual } from "@/lib/orcamentos/_actions";
import type { Orcamento } from "@/lib/orcamentos/types";
import { DreDiagram } from "./DreDiagram";
import { OficialStar, StatusPill, TipoLabel } from "../OrcamentoMeta";

interface Props {
  tenantId: string;
  orcamento: Orcamento;
  isCurrent: boolean;
}

export function OrcamentoAreaClient({ tenantId, orcamento, isCurrent }: Props) {
  const router = useRouter();
  const t = useTranslations("orcamentos");

  const panelRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else panelRef.current?.requestFullscreen().catch(() => {});
  }

  // Abriu por link direto / nova aba: garante que este é o orçamento em uso.
  useEffect(() => {
    if (isCurrent) return;
    setOrcamentoAtual(tenantId, orcamento.id).then(() => router.refresh());
  }, [isCurrent, tenantId, orcamento.id, router]);

  return (
    <>
      <div className="admin-subheader">
        <div className="orc-area-heading">
          <h1 className="admin-page-title orc-area-title" title={orcamento.label}>
            {orcamento.oficial && <OficialStar title={t("official")} />}
            {orcamento.label}
          </h1>
          <TipoLabel tipo={orcamento.tipo} label={t(`tipo_${orcamento.tipo}`)} />
          <StatusPill status={orcamento.status} label={t(`status_${orcamento.status}`)} />
        </div>
      </div>

      <div className="admin-content">
        <div className={`orc-panel orc-panel--map${fullscreen ? " is-fullscreen" : ""}`} ref={panelRef}>
          <button
            type="button"
            className="orc-fs-btn"
            onClick={toggleFullscreen}
            title={fullscreen ? t("exitFullscreen") : t("fullscreen")}
            aria-label={fullscreen ? t("exitFullscreen") : t("fullscreen")}
          >
            {fullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            )}
          </button>
          <DreDiagram orcamentoId={orcamento.id} year={orcamento.year} />
        </div>
      </div>
    </>
  );
}
