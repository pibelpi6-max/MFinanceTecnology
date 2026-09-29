"use client";

import { useCallback, useRef } from "react";
import { saveUserPreference } from "@/app/_actions/userPreferences";
import type { TablePrefs } from "./types";

/**
 * Hook que gerencia a persistência das preferências da tabela.
 * - Mantém uma "fonte da verdade" do que está salvo (savedRef)
 * - Debounce de 800ms pra evitar saves redundantes
 * - Permite atualizar campos parciais (cols OR widths) mesclando
 */
export function usePersistedPrefs(prefsKey: string, initial?: TablePrefs) {
  const savedRef = useRef<TablePrefs>(initial ?? {});
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = useCallback(
    (partial: Partial<TablePrefs>) => {
      savedRef.current = { ...savedRef.current, ...partial };

      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveUserPreference(prefsKey, savedRef.current);
      }, 800);
    },
    [prefsKey],
  );

  return persist;
}
