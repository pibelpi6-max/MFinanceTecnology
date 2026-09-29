"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { setLocale } from "@/app/actions";
import { BRAND } from "@/config/brand";
import type { SupportedLocale } from "@/i18n/request";

const IconMail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" />
  </svg>
);
const IconLock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconEye = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const LOCALES: { code: SupportedLocale; label: string }[] = [
  { code: "pt-BR", label: "PT" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
];

export default function LoginPage() {
  const router = useRouter();
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("auth");
  const [, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function mapError(message: string): string {
    if (message.includes("Invalid login credentials")) return t("invalidCredentials");
    if (message.includes("Email not confirmed")) return t("emailNotConfirmed");
    if (message.includes("Too many requests")) return t("tooManyRequests");
    return t("generic");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError(t("invalidCredentials"));
      return;
    }

    setLoading(true);
    try {
      if (!rememberMe) sessionStorage.setItem("sf:session-only", "1");
      else sessionStorage.removeItem("sf:session-only");

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(mapError(signInError.message));
        setLoading(false);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError(t("generic"));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f2f5] p-4">
      <div className="absolute top-5 right-5 flex gap-1">
        {LOCALES.map((l) => (
          <button
            key={l.code}
            onClick={() => startTransition(() => setLocale(l.code, "/login"))}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
              locale === l.code ? "bg-primary text-white" : "text-gray-400 hover:bg-white"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <div className="mb-7 text-center">
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-extrabold text-white"
            style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.primaryHover})` }}
          >
            SF
          </div>
          <h1 className="font-display text-xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
            <IconAlert />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span className="text-primary"><IconMail /></span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("email")}
              autoComplete="email"
              required
              className="w-full text-sm text-gray-800 outline-none placeholder:text-gray-400"
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span className="text-primary"><IconLock /></span>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("password")}
              autoComplete="current-password"
              required
              className="w-full text-sm text-gray-800 outline-none placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-gray-400 hover:text-gray-600"
              title={showPassword ? t("hidePassword") : t("showPassword")}
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </label>

          <label className="flex select-none items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            {t("rememberMe")}
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? t("signingIn") : t("signIn")}
          </button>
        </form>
      </div>
    </div>
  );
}
