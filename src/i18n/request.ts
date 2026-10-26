import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const SUPPORTED_LOCALES = ["pt-BR", "en", "es"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// Imports estáticos (um por idioma): o bundler enxerga cada arquivo, sem depender
// de um "contexto" dinâmico que o servidor de desenvolvimento perde quando os
// arquivos de tradução são trocados (ex.: git pull) com o servidor ligado.
const catalogs: Record<SupportedLocale, () => Promise<{ default: Record<string, unknown> }>> = {
  "pt-BR": () => import("../../messages/pt-BR.json"),
  en: () => import("../../messages/en.json"),
  es: () => import("../../messages/es.json"),
};

export default getRequestConfig(async () => {
  const headerStore = await headers();
  const headerLocale = headerStore.get("x-locale") ?? "";
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value ?? "";

  const locale: SupportedLocale = isSupportedLocale(headerLocale)
    ? headerLocale
    : isSupportedLocale(cookieLocale)
    ? cookieLocale
    : "pt-BR";

  const messages = (await catalogs[locale]()).default;

  return { locale, messages };
});
