"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { TablePrefs } from "@/components/ui/DataTable/types";
import type { TenantCurrency } from "@/lib/receita/queries";
import { ProdutosPanel } from "../receita/ProdutosPanel";
import { FxPanel } from "../receita/ReceitaClient";
import type { RateTable } from "@/lib/receita/calc";
import type { ProductRow } from "../receita/ReceitaClient";
import { deleteTenantCurrency, saveTenantCurrency } from "./_actions";

interface Props {
  orcamentoId: string;
  year: number;
  productTypeId: string;
  products: ProductRow[];
  productPrefs?: TablePrefs;
  currencies: TenantCurrency[];
  rates: RateTable;
}

type Tab = "products" | "currencies" | "fx";

/** Parâmetros agrupados pelo módulo a que pertencem; módulos sem parâmetros ainda ganham seção quando tiverem. */
export function ParametrosClient(p: Props) {
  const t = useTranslations("receita");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("products");
  const [error, setError] = useState<string | null>(null);
  const groups: { title: string; items: { key: Tab | null; label: string }[] }[] = [
    { title: t("parGroupGeneral"), items: [{ key: "currencies", label: t("globalCurrencies") }] },
    { title: t("parGroupBudget"), items: [{ key: "fx", label: t("tabFx") }] },
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
        {tab === "fx" && <FxPanel orcamentoId={p.orcamentoId} rates={p.rates} companyCurrencies={p.currencies.map((c) => c.code)} onError={setError} />}
        {tab === "currencies" && <CurrenciesPanel orcamentoId={p.orcamentoId} currencies={p.currencies} onError={setError} />}
      </div>
    </div>
  );
}

function CurrenciesPanel({ orcamentoId, currencies, onError }: { orcamentoId: string; currencies: TenantCurrency[]; onError: (s: string | null) => void }) {
  const t = useTranslations("receita");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="rec-panel">
      <div className="rec-fx-head">
        <label className="rec-field">
          {t("currency")}
          <input value={code} maxLength={3} placeholder="USD" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
        <label className="rec-field">
          {t("currencyName")}
          <input value={name} placeholder={t("currencyNamePlaceholder")} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button
          variant="accent-blue" size="sm" className="px-3" isLoading={pending} loadingText={t("saving")} disabled={code.length !== 3}
          onClick={() => start(async () => {
            onError(null);
            const r = await saveTenantCurrency({ orcamentoId, code, name });
            if (r.error) return onError(r.error);
            setCode("");
            setName("");
            router.refresh();
          })}
        >
          + {t("currencyAdd")}
        </Button>
      </div>
      <div className="rec-presets">
        <span className="rec-chip rec-chip-on">BRL</span>
        {currencies.filter((c) => c.code !== "BRL").map((c) => (
          <span key={c.code} className="rec-chip" title={c.name}>
            {c.code}{c.name ? ` · ${c.name}` : ""}
            <button
              type="button"
              className="rec-edit-x"
              aria-label={t("remove")}
              title={t("remove")}
              disabled={pending}
              onClick={() => start(async () => {
                onError(null);
                const r = await deleteTenantCurrency({ orcamentoId, code: c.code });
                if (r.error) onError(r.error); else router.refresh();
              })}
            >×</button>
          </span>
        ))}
      </div>
    </div>
  );
}
