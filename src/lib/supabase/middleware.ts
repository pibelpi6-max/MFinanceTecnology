import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Atualiza a sessão do Supabase a cada requisição — essencial pro
 * Next.js App Router: Server Components (como src/lib/supabase/server.ts)
 * NÃO conseguem gravar cookies (só ler), então um `getUser()` feito lá
 * dentro até renova o token em memória pra aquela requisição, mas não
 * consegue persistir o cookie novo de volta no navegador (o `setAll` de
 * server.ts cai no `catch` e descarta silenciosamente). Sem isso, o
 * access token expira (padrão do Supabase: ~1h) e nunca é renovado de
 * verdade — as requisições seguintes caem pro papel "anon" (sem GRANT
 * nas tabelas, ver migration 0004_grants.sql) e todo select começa a
 * falhar com "permission denied for table ...".
 *
 * Esse era o bug por trás do erro reportado pela usuária (23:33, sessão
 * aberta havia mais de 1h, nada mudou no banco — só o token expirou e
 * ninguém renovou o cookie). O middleware.ts na raiz chama esta função
 * em toda requisição; como ele usa NextResponse (não um Server
 * Component), CONSEGUE gravar o cookie renovado de volta.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: não colocar nenhuma lógica entre o createServerClient e o
  // getUser() abaixo — um erro simples aqui já deixou gente deslogada de
  // forma aleatória e difícil de depurar (aviso do próprio Supabase).
  // getUser() valida o token com o servidor de auth (ao contrário de
  // getSession(), que só lê o cookie) e, se precisar, renova — e é essa
  // renovação que precisa ser gravada no response abaixo.
  await supabase.auth.getUser();

  return supabaseResponse;
}
