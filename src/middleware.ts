import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Único trabalho deste middleware: manter a sessão do Supabase renovada
 * em toda requisição (ver src/lib/supabase/middleware.ts pro porquê). O
 * redirecionamento de rota protegida continua em src/app/admin/layout.tsx
 * (getUser() + redirect("/login")) — não duplicado aqui.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Roda em tudo, exceto assets estáticos — mesmo padrão recomendado
  // pelo guia oficial do Supabase para Next.js App Router.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
