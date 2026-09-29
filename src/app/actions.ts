"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function safeInternalPath(pathname: string): string {
  if (typeof pathname !== "string") return "/";
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "/";
  if (pathname.includes("://")) return "/";
  return pathname;
}

export async function setLocale(locale: string, pathname: string = "/") {
  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  redirect(safeInternalPath(pathname));
}
