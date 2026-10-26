"use client";

import { useEffect } from "react";
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
        <div className="orc-panel orc-panel--scroll">
          <DreDiagram orcamentoId={orcamento.id} year={orcamento.year} />
        </div>
      </div>
    </>
  );
}
