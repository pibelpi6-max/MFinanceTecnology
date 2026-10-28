"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { RateTable } from "@/lib/receita/calc";
import type { TenantCurrency } from "@/lib/receita/queries";
import { saveCurrencyRates } from "../receita/_actions";
import { deleteTenantCurrency, saveTenantCurrency } from "./_actions";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const toNum = (s: string) => {
  const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
const toText = (n: number) => (n === 0 ? "" : String(n).replace(".", ","));

/** Moedas: informa a sigla, adiciona, e já aparecem os 12 meses para a taxa (do orçamento aberto). */
export function MoedasPanel({ orcamentoId, currencies, rates, onError }: {
  orcamentoId: string;
  currencies: TenantCurrency[];
  rates: RateTable;
  onError: (s: string | null) => void;
}) {
  const t = useTranslations("receita");
  const router = useRouter();
  const [pending, start] = useTransition();
  const registered = new Set(currencies.map((c) => c.code));
  const codes = Array.from(new Set([...currencies.map((c) => c.code), ...Object.keys(rates)])).filter((c) => c !== "BRL").sort();
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<string | null>(codes[0] ?? null);
  const [vals, setVals] = useState<string[]>(() => MONTHS.map((m) => toText(rates[codes[0] ?? ""]?.[m] ?? 0)));
  const [dirty, setDirty] = useState(false);

  const pick = (c: string | null) => {
    setSelected(c);
    setVals(MONTHS.map((m) => toText(rates[c ?? ""]?.[m] ?? 0)));
    setDirty(false);
  };

  function add() {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) return onError(t("currencyInvalid"));
    onError(null);
    start(async () => {
      if (!registered.has(c) && !rates[c]) {
        const r = await saveTenantCurrency({ orcamentoId, code: c, name: "" });
        if (r.error) return onError(r.error);
      }
      setCode("");
      pick(c);
      router.refresh();
    });
  }

  function saveRates() {
    if (!selected) return;
    onError(null);
    start(async () => {
      const r = await saveCurrencyRates({ orcamentoId, currency: selected, rates: vals.map(toNum) });
      if (r.error) return onError(r.error);
      setDirty(false);
      router.refresh();
    });
  }

  function remove(c: string) {
    onError(null);
    start(async () => {
      const r = await deleteTenantCurrency({ orcamentoId, code: c });
      if (r.error) return onError(r.error);
      if (selected === c) pick(null);
      router.refresh();
    });
  }

  return (
    <div className="mo-panel">
      <div className="mo-add">
        <input
          value={code}
          maxLength={3}
          placeholder="USD"
          aria-label={t("currency")}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button variant="accent-blue" size="sm" className="px-3" onClick={add} isLoading={pending}>
          + {t("currencyAdd")}
        </Button>
      </div>

      {codes.length > 0 && (
        <div className="mo-chips">
          {codes.map((c) => (
            <span key={c} className={`rec-chip${c === selected ? " rec-chip-on" : ""}`}>
              <button type="button" className="mo-chip-btn" onClick={() => pick(c)}>{c}</button>
              {registered.has(c) && (
                <button type="button" className="mo-chip-x" aria-label={t("remove")} title={t("remove")} disabled={pending} onClick={() => remove(c)}>×</button>
              )}
            </span>
          ))}
        </div>
      )}

      {selected && (
        <div className="mo-rates">
          <div className="rec-fx-grid mo-grid">
            {MONTHS.map((m, i) => (
              <div key={m} className="rec-field">
                <span>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(2000, m - 1, 1))}</span>
                <span className="rec-fx-cell">
                  <input
                    aria-label={new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2000, m - 1, 1))}
                    inputMode="decimal"
                    value={vals[i]}
                    placeholder="0,0000"
                    onChange={(e) => {
                      if (!/^\d*[.,]?\d*$/.test(e.target.value)) return;
                      setDirty(true);
                      setVals((x) => x.map((y, j) => (j === i ? e.target.value : y)));
                    }}
                  />
                  {i < MONTHS.length - 1 && (
                    <button
                      type="button"
                      className="rec-fx-repeat"
                      title={t("fxRepeatNext")}
                      aria-label={t("fxRepeatNext")}
                      disabled={!vals[i]}
                      onClick={() => { setDirty(true); setVals((x) => x.map((y, j) => (j > i ? x[i] : y))); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 6 6 6-6 6M13 6l6 6-6 6" /></svg>
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="mo-actions">
            <Button variant="primary" size="sm" onClick={saveRates} isLoading={pending} loadingText={t("saving")} disabled={!dirty}>
              {t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
