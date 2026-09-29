// src/config/brand.ts
//
// ┌─────────────────────────────────────────────────────┐
// │  Sistema Financeiro — Configuração central de marca  │
// │                                                       │
// │  Para mudar a cor do sistema inteiro:                │
// │  1. Altere PRIMARY abaixo                             │
// │  2. Atualize PRIMARY_RGB com os valores R, G, B       │
// │  3. Salve — tudo reflete automaticamente               │
// └─────────────────────────────────────────────────────┘
export const BRAND = {
  // ─── Identidade ───────────────────────────────────────────
  name:         "Sistema Financeiro",
  // Azul suave — nem forte nem fraco (referência: ícones estilo O365)
  primary:      "#3E6FE0",
  primaryHover: "#2E56C0",
  primaryRgb:   "62, 111, 224",
  // Derivadas
  primaryLight:      "rgba(62, 111, 224, 0.10)",
  primaryLight2:     "rgba(62, 111, 224, 0.15)",
  primaryGlow:       "rgba(62, 111, 224, 0.18)",
  primaryBorder:     "rgba(62, 111, 224, 0.55)",
  primaryBorderSoft: "rgba(62, 111, 224, 0.30)",
} as const;

export type Brand = typeof BRAND;
