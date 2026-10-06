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
 * `hasVisibleChildren` (opcional, default false — não afeta o seletor de
 * pai nem o painel da Matriz, que não passam essa prop) faz a própria
 * coluna também continuar até o fim da linha quando ESTE nó tem filhos
 * renderizados logo abaixo (expandido e com children), mesmo sendo o
 * último irmão. Sem isso, um nó "último irmão mas com filhos" desenhava
 * só a meia-altura + cotovelo e a metade de baixo da própria linha ficava
 * em branco, cortando visualmente a conexão com o filho (que começa um
 * nível mais à direita, mas logo em seguida verticalmente).
 */
export function TreeGuides({
  ancestorContinues,
  isLast,
  depth,
  hasVisibleChildren = false,
}: {
  ancestorContinues: boolean[];
  isLast: boolean;
  depth: number;
  hasVisibleChildren?: boolean;
}) {
  if (depth === 0) return null;
  const ownContinues = !isLast || hasVisibleChildren;
  return (
    <span className="tree-guides" aria-hidden="true">
      {ancestorContinues.map((continues, i) => (
        <span key={i} className={`tree-guide-col${continues ? " is-continuing" : ""}`} />
      ))}
      <span className={`tree-guide-col tree-guide-col--own${ownContinues ? " is-continuing" : ""}`} />
    </span>
  );
}
