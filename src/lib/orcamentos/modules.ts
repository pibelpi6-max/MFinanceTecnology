/**
 * Módulos do mapa do orçamento (DRE no centro). Cada card do mapa leva ao
 * seu módulo; os que já existem apontam para a tela pronta, os demais caem
 * numa página "em construção" em /admin/orcamentos/[id]/[slug].
 */
export interface OrcamentoModule {
  slug: string;
  title: string;
  description: string;
  /** Caminho SVG (viewBox 24x24, traço) do ícone do módulo. */
  icon: string;
  /** Tela já existente do sistema; sem isso, abre a página do módulo em construção. */
  existingHref?: (year: number) => string;
}

export const ORCAMENTO_MODULES: OrcamentoModule[] = [
  { slug: "receita", icon: "M3 17l6-6 4 4 8-8M15 7h6v6", title: "Receita", description: "Receita por preço × volume, deduções e CPV que alimentam a DRE." },
  { slug: "custos", icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6", title: "Custos (ficha técnica)", description: "Ficha técnica e custo unitário total, com o custo de matéria-prima que alimenta a DRE." },
  { slug: "capex", icon: "M3 21V10l6 4V10l6 4V6h3v15zM3 21h18", title: "Capex", description: "Investimentos, depreciação para a DRE e imobilizado para o Balanço." },
  { slug: "modelos", icon: "M6 3v18M12 3v18M18 3v18M4 8h4M10 15h4M16 10h4", title: "Modelos", description: "Modelos de FP&A, como impostos, que alimentam a DRE." },
  { slug: "matrix", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z", title: "Matrix", description: "Despesas lançadas pelos gestores de centro de custo.", existingHref: (year) => `/admin/orcamento/matriz?ano=${year}` },
  { slug: "workflow-aprovacao", icon: "M8 4h8v3H8zM6 5H5v16h14V5h-1M9 14l2 2 4-4", title: "Workflow Aprovação DRE", description: "Fluxo de aprovação da DRE pela diretoria e CFO." },
  { slug: "dre", icon: "M3 4h18v16H3zM3 10h18M3 15h18M9 10v10", title: "DRE", description: "Demonstração do resultado consolidada a partir de todos os módulos que a alimentam." },
  { slug: "rateio", icon: "M12 3v9h9a9 9 0 1 1-9-9zM15 3a9 9 0 0 1 6 6h-6z", title: "Rateio", description: "Rateio de custos e despesas aplicado à DRE." },
  { slug: "fluxo-de-caixa", icon: "M4 8h14l-4-4M20 16H6l4 4", title: "Fluxo de caixa", description: "Fluxo de caixa projetado a partir da DRE e das condições financeiras." },
  { slug: "balanco", icon: "M12 3v18M6 21h12M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z", title: "Balanço", description: "Balanço patrimonial a partir da DRE e do imobilizado." },
  { slug: "fluxo-de-caixa-indireto", icon: "M4 8h14l-4-4M20 16H6l4 4", title: "Fluxo de caixa Indireto", description: "Fluxo de caixa pelo método indireto, a partir do resultado e do balanço." },
];

export function getOrcamentoModule(slug: string): OrcamentoModule | undefined {
  return ORCAMENTO_MODULES.find((m) => m.slug === slug);
}

export function orcamentoModuleHref(m: OrcamentoModule, orcamentoId: string, year: number): string {
  return m.existingHref ? m.existingHref(year) : `/admin/orcamentos/${orcamentoId}/${m.slug}`;
}
