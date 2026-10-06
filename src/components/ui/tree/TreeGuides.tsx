/**
 * Guias verticais pontilhadas de uma linha de árvore (uma coluna por
 * ancestral, mais a conexão da própria linha) — a mesma ideia visual do
 * componente de árvore portado de outro projeto, mas adaptada para uma
 * lista plana com `depth` (ver buildDimensionHierarchy em
 * src/lib/dimensions/hierarchy.ts) em vez de JSX aninhado, já que aqui a
 * árvore precisa caber tanto numa <table> (DataTable) quanto em listas
 * soltas (seletor de pai, painel da Matriz).
 *
 * `ancestorContinues[k]` diz se o ancestral no nível k ainda tem mais
 * irmãos depois dele (linha contínua) ou não (coluna em branco). A última
 * coluna ("own") é sempre a própria conexão desta linha com seu pai/irmão
 * anterior: meia altura + cotovelo horizontal quando é o último filho,
 * altura cheia quando há mais irmãos depois.
 *
 * A ligação visual entre o cotovelo de um nó e o filho logo abaixo dele
 * (quando o nó é filho único, sem mais irmãos) não é feita esticando a
 * PRÓPRIA coluna deste nó — é o traço do FILHO que sobe (ver
 * `.tree-guide-col--own::before { top: -26px }` em admin.css) até a
 * altura do cotovelo do pai. Isso cria o efeito "escada" pedido pela
 * usuária: o traço desce reto, dá um passo pro lado no cotovelo, desce
 * reto de novo a partir dali — em vez de duas colunas paralelas (uma do
 * pai esticada pra baixo, outra do filho) ligeiramente desencontradas.
 */
export function TreeGuides({
  ancestorContinues,
  isLast,
  depth,
}: {
  ancestorContinues: boolean[];
  isLast: boolean;
  depth: number;
}) {
  if (depth === 0) return null;
  return (
    <span className="tree-guides" aria-hidden="true">
      {ancestorContinues.map((continues, i) => (
        <span key={i} className={`tree-guide-col${continues ? " is-continuing" : ""}`} />
      ))}
      <span className={`tree-guide-col tree-guide-col--own${isLast ? "" : " is-continuing"}`} />
    </span>
  );
}
