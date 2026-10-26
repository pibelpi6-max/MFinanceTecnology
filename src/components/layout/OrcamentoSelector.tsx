"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setOrcamentoAtual } from "@/lib/orcamentos/_actions";
import type { Orcamento } from "@/lib/orcamentos/types";

interface OrcamentoSelectorProps {
  tenantId: string;
  orcamentos: Orcamento[];
  currentOrcamentoId: string | null;
}

const NONE_VALUE = "__none__";

/**
 * Seletor global e persistente de qual Orçamento (revisão) está em uso
 * — decidido com a usuária em 14/10 (ver migration
 * 0015_religar_orcamento.sql): um seletor único, visível de qualquer
 * tela do admin, em vez de um dropdown independente em Matriz/Pacotes/
 * Comparativo. A escolha persiste por usuário (user_preferences), não
 * por aba/sessão.
 */
export function OrcamentoSelector({ tenantId, orcamentos, currentOrcamentoId }: OrcamentoSelectorProps) {
  const router = useRouter();
  const t = useTranslations("settings.orcamentos");
  const [optimisticId, setOptimisticId] = useState<string | null | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const displayId = optimisticId !== undefined ? optimisticId : currentOrcamentoId;

  function handleChange(value: string) {
    const nextId = value === NONE_VALUE ? null : value;
    setOptimisticId(nextId);
    startTransition(async () => {
      await setOrcamentoAtual(tenantId, nextId);
      router.refresh();
    });
  }

  if (orcamentos.length === 0) return null;

  const sorted = [...orcamentos].sort((a, b) => b.year - a.year || a.label.localeCompare(b.label));

  return (
    <select
      className="year-select orcamento-selector"
      value={displayId ?? NONE_VALUE}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      title={t("selectorTitle")}
    >
      <option value={NONE_VALUE}>{t("selectorNone")}</option>
      {sorted.map((orc) => (
        <option key={orc.id} value={orc.id}>
          {orc.year} · {orc.label}
        </option>
      ))}
    </select>
  );
}
