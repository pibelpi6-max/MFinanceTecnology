"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { setupProdutos } from "./_actions";

export function ReceitaSetup({ orcamentoId }: { orcamentoId: string }) {
  const t = useTranslations("receita");
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const names = text.split("\n").map((n) => n.trim()).filter(Boolean);

  return (
    <div className="rec-setup">
      <h2>{t("setupTitle")}</h2>
      <p>{t("setupBody")}</p>
      <label className="rec-field" htmlFor="rec-setup-names">{t("setupLabel")}</label>
      <textarea
        id="rec-setup-names"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("setupPlaceholder")}
      />
      {error && <div className="rec-error">{error}</div>}
      <Button
        variant="primary"
        disabled={names.length === 0}
        isLoading={pending}
        loadingText={t("saving")}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await setupProdutos({ orcamentoId, names });
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {t("setupButton", { count: names.length })}
      </Button>
      <span className="rec-hint">{t("setupHint")}</span>
    </div>
  );
}
