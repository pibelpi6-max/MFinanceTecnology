"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Máquina de estados genérica para "no máximo 1 item expandido por vez",
 * com animação de abertura/fechamento sem flicker e sem setTimeout.
 *
 * Extraída de `DataTable` para ser reaproveitada por qualquer nível da
 * árvore Escola → Curso → Turma → Aluno → ... sem duplicar a lógica.
 *
 * Dois modos de uso:
 *  - Controlado: passe `controlledId` (inclusive `null`) — quem chama decide
 *    qual id deve estar aberto (ex.: DataTable recebe `expandedRowId` de fora).
 *    Nesse modo `toggle()` não faz nada; controle via a prop externa.
 *  - Não-controlado: não passe `controlledId` — o próprio hook guarda o id
 *    aberto e `toggle(id)` alterna abrir/fechar (ex.: CursosPageClient
 *    decidindo qual curso está expandido).
 */
export type ExpandPhase = "opening" | "open" | "closing";

export interface ExpandRenderState<K> {
  id: K;
  phase: ExpandPhase;
}

export function useSingleExpand<K extends string>(controlledId?: K | null) {
  const [internalId, setInternalId] = useState<K | null>(null);
  const [render, setRender] = useState<ExpandRenderState<K> | null>(null);
  const pendingIdRef = useRef<K | null>(null);

  const isControlled = controlledId !== undefined;
  const requestedId = isControlled ? controlledId : internalId;

  useEffect(() => {
    setRender((prev) => {
      if (requestedId === null) {
        // Pedido para fechar: só anima saída se algo estiver aberto/abrindo.
        if (!prev || prev.phase === "closing") return prev;
        pendingIdRef.current = null;
        return { id: prev.id, phase: "closing" };
      }
      if (!prev) {
        return { id: requestedId, phase: "opening" };
      }
      if (prev.id === requestedId) {
        if (prev.phase === "closing") {
          // Pediram pra abrir de novo o mesmo item que ainda estava fechando
          // (ex.: fechou e reabriu rapido, ou o componente que anima o
          // fechamento foi desmontado no meio do caminho -- como acontece
          // quando o Modal por cima fecha de repente -- e por isso
          // handleAnimationEnd nunca chegou a ser chamado). Sem isso, o hook
          // ficava travado achando para sempre que esse item ainda estava
          // fechando, e nunca reabria.
          pendingIdRef.current = null;
          return { id: requestedId, phase: "opening" };
        }
        // Mesmo item ja solicitado e ja aberto/abrindo -- nada a fazer (evita
        // reiniciar animacao).
        return prev;
      }
      // Troca de item: fecha o atual com animação; o novo só abre quando a
      // animação de saída terminar (ver handleAnimationEnd).
      pendingIdRef.current = requestedId;
      return { id: prev.id, phase: "closing" };
    });
  }, [requestedId]);

  function handleAnimationEnd(id: K, phase: ExpandPhase) {
    setRender((current) => {
      if (!current || current.id !== id || current.phase !== phase) return current;
      if (phase === "opening") return { id, phase: "open" };
      if (phase === "closing") {
        const next = pendingIdRef.current;
        pendingIdRef.current = null;
        return next ? { id: next, phase: "opening" } : null;
      }
      return current;
    });
  }

  function toggle(id: K) {
    if (isControlled) return;
    setInternalId((cur) => (cur === id ? null : id));
  }

  function close() {
    if (isControlled) return;
    setInternalId(null);
  }

  function isOpen(id: K) {
    return render?.id === id;
  }

  function phaseOf(id: K): ExpandPhase | null {
    return render?.id === id ? render.phase : null;
  }

  return { expandedId: requestedId, render, toggle, close, isOpen, phaseOf, handleAnimationEnd };
}
