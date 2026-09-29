import type { ReactNode } from "react";

export interface ColumnMeta<T> {
  key: string;
  label: string;
  /** OPCIONAL: alinhamento do texto no header e do conteudo da celula. Default: left. */
  align?: "left" | "right";
  width?: number;
  minWidth?: number;
  defaultVisible?: boolean;
  render?: (item: T) => ReactNode;
  filterable?: boolean;
  filterValueLabels?: Record<string, string>;
  getText?: (item: T) => string;
  /**
   * OPCIONAL: quando true, suprime o Tooltip automático nessa coluna.
   * Use em colunas com controles interativos próprios (ex: botão Contatos).
   */
  noTooltip?: boolean;
  /**
   * OPCIONAL: quando false, suprime sort nessa coluna.
   * Default: true se getText estiver definido, false caso contrário.
   */
  sortable?: boolean;
  /**
   * OPCIONAL: quando true, a busca usa SÓ o getText (ignora o fallback de
   * filterValueLabels). Use quando o getText já retorna o label final e o
   * valor cru do banco não reflete o texto exibido (ex: observação sem nota).
   */
  searchByTextOnly?: boolean;
  /** OPCIONAL: agrupa a coluna numa seção no ColumnsModal (ex: "Identificação"). */
  section?: string;
  filterValue?: (item: T) => string;
}

/**
 * Preferência de uma coluna (visível ou não, e na ordem do array).
 */
export interface ColPref {
  key: string;
  on: boolean;
}

/**
 * Preferências do usuário salvas no banco (user_preferences).
 * Persistência atômica: cols + widths sempre juntos.
 */
export interface TablePrefs {
  cols?: ColPref[];
  widths?: Record<string, number>;
  filters?: Record<string, string[]>;
  /**
   * Coluna ordenada e direção. Apenas uma coluna por vez.
   * Quando undefined, tabela renderiza na ordem natural do data array.
   */
  sort?: { col: string; dir: "asc" | "desc" };
}

export interface RowMeta<T> {
  item: T;
  depth: number;
}

export interface DrawerConfig {
  title: ReactNode;
  subtitle?: ReactNode;
  content: ReactNode;
}

export interface DataTableProps<T extends { id: string }> {
  items: T[];
  columns: ColumnMeta<T>[];
  prefsKey: string;
  initialPrefs?: TablePrefs;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  editIcon?: React.ReactNode;
  editLabel?: string;
  onNew: () => void;
  newLabel: string;
  /** OPCIONAL: acoes extras no topo, ao lado do botao "Novo" (ex: botao Importar). */
  extraActions?: ReactNode;
  /** OPCIONAL: exibe um icone de importar (upload) entre a busca e o botao de colunas; chamado ao clicar. */
  onImport?: () => void;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  buildTree?: (items: T[]) => RowMeta<T>[];
  drawerForRow?: (item: T) => DrawerConfig | null;
  /**
   * OPCIONAL: incremente esse numero (ex.: contador) pra fechar o Drawer de
   * info (viewingItem) de fora - util quando uma acao dentro de uma linha
   * expandida (renderExpanded) deve fechar o drawer se estiver aberto.
   */
  closeDrawerSignal?: number;
  /**
   * OPCIONAL: Define em qual coluna o botão "i" aparece (vincula pela `key` da coluna).
   * Default: primeira coluna visível.
   * Útil quando o usuário pode reordenar colunas e o botão "i" deve permanecer
   * vinculado à coluna principal (ex: "name").
   */
  infoColumnKey?: string;
  /** Retorna true se a linha deve destacar o ícone "i" (ex: tem observação). */
  hasHighlight?: (item: T) => boolean;
  /** OPCIONAL: icone exibido antes do botao "i" na coluna infoColumnKey (ex: emoji/icone da especialidade). */
  rowIcon?: (item: T) => ReactNode;
  /**
   * OPCIONAL: Predicado que determina se uma linha deve receber indentação hierárquica.
   * Quando fornecido, substitui a verificação padrão `depth > 0`.
   * Ex: `(school) => school.type === "branch"`
   */
  isIndentedRow?: (item: T) => boolean;
  /**
   * OPCIONAL: quando retorna true, a <tr> recebe opacity 0.55 (linha esmaecida).
   * Ex: `(school) => school.status === "inactive"`
   */
  isDimmedRow?: (item: T) => boolean;
  renderExpanded?: (item: T) => React.ReactNode;
  expandedRowId?: string | null;
  /**
   * OPCIONAL: quando retorna true, desenha uma linha divisória mais forte
   * embaixo dessa linha (ex: separar visualmente uma linha de criação
   * inline do restante da lista).
   */
  rowBorderBottom?: (item: T) => boolean;
  /** OPCIONAL: classe Tailwind de tamanho de fonte do corpo da tabela (default "text-sm" = 14px). */
  bodyTextClassName?: string;
}
