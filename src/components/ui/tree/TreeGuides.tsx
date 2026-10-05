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
