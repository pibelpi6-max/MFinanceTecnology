import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Usuário autenticado, resolvido UMA vez por requisição (React cache).
 * `supabase.auth.getUser()` faz uma chamada de rede ao Supabase Auth; antes,
 * layout + páginas + preferências chamavam isso 4–6× a cada clique de menu.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
