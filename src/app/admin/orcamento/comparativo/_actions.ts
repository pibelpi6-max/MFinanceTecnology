"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { askClaude, AnthropicNotConfiguredError } from "@/lib/ai/anthropic";

interface ActionResult {
  success?: true;
  error?: string;
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export async function saveDeviationExplanation(input: {
  explanationId: string | null;
  year: number;
  month: number;
  accountNodeId: string;
  costCenterNodeId: string;
  explanation: string;
}): Promise<ActionResult> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (tenant.role === "leitor") return { error: "Seu perfil não tem permissão para explicar desvios." };
    if (!input.explanation.trim()) return { error: "Escreva uma explicação." };

    const supabase = await createClient();

    if (input.explanationId) {
      const { error } = await supabase
        .from("deviation_explanations")
        .update({ explanation: input.explanation.trim() })
        .eq("id", input.explanationId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("deviation_explanations").insert({
        tenant_id: tenant.tenantId,
        year: input.year,
        month: input.month,
        account_node_id: input.accountNodeId,
        cost_center_node_id: input.costCenterNodeId,
        explanation: input.explanation.trim(),
        created_by: tenant.userId,
      });
      if (error) return { error: error.message };
    }

    revalidatePath("/admin/orcamento/comparativo");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

/**
 * Sugere um texto de explicação de desvio via API do Claude — o usuário
 * sempre revisa e pode editar antes de salvar (esta função nunca grava
 * nada, só retorna uma sugestão).
 */
export async function suggestDeviationExplanation(input: {
  accountName: string;
  costCenterName: string;
  year: number;
  month: number;
  budgeted: number;
  actual: number;
  variancePct: number | null;
}): Promise<{ suggestion?: string; error?: string }> {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Não autenticado" };

  const monthName = MONTH_NAMES[input.month - 1] ?? String(input.month);
  const currency = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const variancePctText = input.variancePct !== null ? `${input.variancePct > 0 ? "+" : ""}${input.variancePct.toFixed(1)}%` : "n/d";

  try {
    const suggestion = await askClaude({
      system:
        "Você ajuda um analista de FP&A a redigir a explicação de um desvio orçamentário " +
        "(orçado vs. realizado) para constar no relatório mensal da empresa. Escreva em " +
        "português do Brasil, tom profissional e direto, 1 a 2 frases curtas, sem saudação " +
        "nem introdução — apenas o texto da explicação, como se já fosse a nota final. " +
        "Não invente causas específicas que não possam ser deduzidas dos números; quando a " +
        "causa não é conhecida, escreva de forma genérica pedindo validação do responsável " +
        "pelo centro de custo, mas mantendo o texto direto.",
      userMessage:
        `Conta: ${input.accountName}\n` +
        `Centro de custo: ${input.costCenterName}\n` +
        `Período: ${monthName}/${input.year}\n` +
        `Orçado: ${currency(input.budgeted)}\n` +
        `Realizado: ${currency(input.actual)}\n` +
        `Desvio: ${variancePctText}\n\n` +
        "Redija uma sugestão de explicação de desvio para este lançamento.",
      maxTokens: 200,
    });
    return { suggestion };
  } catch (e) {
    if (e instanceof AnthropicNotConfiguredError) {
      return { error: "Integração com a API do Claude ainda não configurada (falta ANTHROPIC_API_KEY no .env.local)." };
    }
    return { error: e instanceof Error ? e.message : "Erro inesperado ao gerar sugestão." };
  }
}
