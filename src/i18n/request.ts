import { getRequestConfig } from "next-intl/server";

// MVP: um único locale (pt-BR). Estrutura pronta para adicionar outros
// locales depois (o DataTable e componentes relacionados já dependem de
// next-intl, herdado do desenhe-app — mantido como está para não alterar
// esse código).
export default getRequestConfig(async () => {
  const locale = "pt-BR";
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages };
});
