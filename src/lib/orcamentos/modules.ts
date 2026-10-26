/**
 * Módulos do mapa do orçamento (DRE no centro). Cada card do mapa leva ao
 * seu módulo; os que já existem apontam para a tela pronta, os demais caem
 * numa página "em construção" em /admin/orcamentos/[id]/[slug].
 */
export interface OrcamentoModule {
  slug: string;
  title: string;
  description: string;
  /** Tela já existente do sistema; sem isso, abre a página do módulo em construção. */
  existingHref?: (year: number) => string;
}

export const ORCAMENTO_MODULES: OrcamentoModule[] = [
  { slug: "receita", title: "Receita", description: "Receita por preço × volume, deduções e CPV que alimentam a DRE." },
  { slug: "custos", title: "Custos (ficha técnica)", description: "Ficha técnica e custo unitário total, com o custo de matéria-prima que alimenta a DRE." },
  { slug: "capex", title: "Capex", description: "Investimentos, depreciação para a DRE e imobilizado para o Balanço." },
  { slug: "modelos", title: "Modelos", description: "Modelos de FP&A, como impostos, que alimentam a DRE." },
  { slug: "matrix", title: "Matrix", description: "Despesas lançadas pelos gestores de centro de custo.", existingHref: (year) => `/admin/orcamento/matriz?ano=${year}` },
  { slug: "workflow-aprovacao", title: "Workflow Aprovação DRE", description: "Fluxo de aprovação da DRE pela diretoria e CFO." },
  { slug: "dre", title: "DRE", description: "Demonstração do resultado consolidada a partir de todos os módulos que a alimentam." },
  { slug: "rateio", title: "Rateio", description: "Rateio de custos e despesas aplicado à DRE." },
  { slug: "fluxo-de-caixa", title: "Fluxo de caixa", description: "Fluxo de caixa projetado a partir da DRE e das condições financeiras." },
  { slug: "balanco", title: "Balanço", description: "Balanço patrimonial a partir da DRE e do imobilizado." },
  { slug: "fluxo-de-caixa-indireto", title: "Fluxo de caixa Indireto", description: "Fluxo de caixa pelo método indireto, a partir do resultado e do balanço." },
];

export function getOrcamentoModule(slug: string): OrcamentoModule | undefined {
  return ORCAMENTO_MODULES.find((m) => m.slug === slug);
}

export function orcamentoModuleHref(m: OrcamentoModule, orcamentoId: string, year: number): string {
  return m.existingHref ? m.existingHref(year) : `/admin/orcamentos/${orcamentoId}/${m.slug}`;
}
