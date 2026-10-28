"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TablePrefs } from "@/components/ui/DataTable/types";
import type { TenantCurrency } from "@/lib/receita/queries";
import { ProdutosPanel } from "../receita/ProdutosPanel";
import { MoedasPanel } from "./MoedasPanel";
import type { RateTable } from "@/lib/receita/calc";
import type { ProductRow } from "../receita/ReceitaClient";

interface Props {
  orcamentoId: string;
  year: number;
  productTypeId: string;
  products: ProductRow[];
  productPrefs?: TablePrefs;
  currencies: TenantCurrency[];
  rates: RateTable;
}

type Tab = "products" | "currencies";

/** Parâmetros agrupados pelo módulo a que pertencem; módulos sem parâmetros ainda ganham seção quando tiverem. */
export function ParametrosClient(p: Props) {
  const t = useTranslations("receita");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("products");
  const [error, setError] = useState<string | null>(null);
  const groups: { title: string; items: { key: Tab | null; label: string }[] }[] = [
    { title: t("parGroupGeneral"), items: [{ key: "currencies", label: t("globalCurrencies") }] },
    { title: t("parGroupRevenue"), items: [{ key: "products", label: t("globalProducts") }] },
    { title: t("parGroupCosts"), items: [{ key: null, label: t("parInputs") }] },
  ];

  return (
    <div className="par-layout">
      <nav className="par-nav" aria-label={t("parNavLabel")}>
        {groups.map((g) => (
          <div key={g.title} className="par-group">
            <div className="par-group-title">{g.title}</div>
            {g.items.map((it) => (
              <button
                key={it.label}
                type="button"
                className={`par-item${it.key && tab === it.key ? " on" : ""}`}
                disabled={!it.key}
                onClick={() => it.key && setTab(it.key)}
              >
                {it.label}
                {!it.key && <small>{t("parSoon")}</small>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="par-body">
        {error && <div className="rec-error">{error}</div>}
        {tab === "products" && (
          <ProdutosPanel
            orcamentoId={p.orcamentoId}
            productTypeId={p.productTypeId}
            year={p.year}
            products={p.products}
            deductions={[]}
            deductionLabels={[]}
            deductionDefaults={[]}
            initialPrefs={p.productPrefs}
            hideDeductions
            onChanged={() => router.refresh()}
            onError={setError}
          />
        )}
        {tab === "currencies" && <MoedasPanel orcamentoId={p.orcamentoId} currencies={p.currencies} rates={p.rates} onError={setError} />}
      </div>
    </div>
  );
}
