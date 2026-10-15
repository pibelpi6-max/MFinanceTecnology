"use server";

import { saveUserPreference } from "@/app/_actions/userPreferences";

function orcamentoAtualKey(tenantId: string) {
  return `orcamento_atual:${tenantId}`;
}

/**
 * Server Action usada pelo OrcamentoSelector (client component) para
 * trocar o Orçamento selecionado no seletor global — precisa ficar num
 * arquivo "use server" separado de queries.ts, porque queries.ts importa
 * createClient (next/headers), que não pode ser bundlado no client. Sem
 * essa separação, o build falha com "You're importing a component that
 * needs next/headers" (o import trace aponta exatamente pra cá).
 */
export async function setOrcamentoAtual(tenantId: string, orcamentoId: string | null) {
  return saveUserPreference(orcamentoAtualKey(tenantId), { orcamentoId });
}
