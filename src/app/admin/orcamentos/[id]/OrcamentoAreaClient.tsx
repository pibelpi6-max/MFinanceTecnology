"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setOrcamentoAtual } from "@/lib/orcamentos/_actions";
import type { Orcamento } from "@/lib/orcamentos/types";
import { OficialStar, StatusPill, TipoLabel } from "../OrcamentoMeta";

interface Props {
  tenantId: string;
  orcamento: Orcamento;
  isCurrent: boolean;
}

interface ModuleTile {
  key: string;
  href?: string;
  icon: string;
}

export function OrcamentoAreaClient({ tenantId, orcamento, isCurrent }: Props) {
  const router = useRouter();
  const t = useTranslations("orcamentos");

  // Abriu por link direto / nova aba: garante que este é o orçamento em uso.
  useEffect(() => {
    if (isCurrent) return;
    setOrcamentoAtual(tenantId, orcamento.id).then(() => router.refresh());
  }, [isCurrent, tenantId, orcamento.id, router]);

  const year = orcamento.year;

  const modules: ModuleTile[] = [
    { key: "matriz", href: `/admin/orcamento/matriz?ano=${year}`, icon: "M3 3v18h18M7 16l4-5 3 3 5-7" },
    {
      key: "pacotes",
      href: `/admin/pacotes?ano=${year}`,
      icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z",
    },
    {
      key: "realizado",
      href: `/admin/orcamento/realizado?ano=${year}`,
      icon: "M9 14.25 12 18l3-3.75M3 6.75h18M5.25 6.75v11.5c0 .69.56 1.25 1.25 1.25h11c.69 0 1.25-.56 1.25-1.25V6.75",
    },
    {
      key: "comparativo",
      href: `/admin/orcamento/comparativo?ano=${year}`,
      icon: "M9 17.25V9.75M12 17.25V6.75M15 17.25v-4.5M3.75 20.25h16.5",
    },
    { key: "tolerancias", icon: "M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5" },
    { key: "versoes", icon: "M6 3v12m0 0a3 3 0 1 0 3 3 3 3 0 0 0-3-3Zm12-6a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 0v1a4 4 0 0 1-4 4H9" },
  ];

  return (
    <>
      <div className="admin-subheader">
        <div className="orc-area-heading">
          <Link href="/admin/orcamentos" className="orc-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t("back")}
          </Link>
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
          <section className="orc-modules-wrap">
            <h2 className="orc-modules-title">{t("modules")}</h2>
            <div className="orc-modules">
              {modules.map((m) => {
                const body = (
                  <>
                    <span className="orc-module-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                      </svg>
                    </span>
                    <span className="orc-module-name">{t(`mod_${m.key}`)}</span>
                    <span className="orc-module-desc">{t(`mod_${m.key}_desc`)}</span>
                    {!m.href && <span className="orc-module-soon">{t("mod_soon")}</span>}
                  </>
                );
                return m.href ? (
                  <Link key={m.key} href={m.href} className="orc-module">
                    {body}
                  </Link>
                ) : (
                  <div key={m.key} className="orc-module is-disabled" aria-disabled="true">
                    {body}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
