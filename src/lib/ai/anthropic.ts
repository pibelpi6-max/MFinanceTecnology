// Camada de serviço para a integração com a API do Claude (Anthropic).
// Fica isolada aqui (nunca espalhada pelas telas) para ser testável e
// para que a chave (ANTHROPIC_API_KEY) nunca precise sair do servidor —
// esse módulo só deve ser importado de Server Actions / Route Handlers.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-5-20250929";

export class AnthropicNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY não configurada no ambiente.");
    this.name = "AnthropicNotConfiguredError";
  }
}

/**
 * Chamada simples e genérica à API de Messages do Claude — um prompt de
 * sistema + uma mensagem do usuário, retornando o texto da resposta.
 * Usada hoje para sugerir explicações de desvio; outras features de IA
 * do produto (ex: análise de tendências) devem reaproveitar esta função
 * em vez de duplicar a chamada HTTP.
 */
export async function askClaude(input: {
  system: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AnthropicNotConfiguredError();

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: input.maxTokens ?? 300,
      system: input.system,
      messages: [{ role: "user", content: input.userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao chamar a API do Claude (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Resposta da API do Claude sem texto.");
  return text.trim();
}
