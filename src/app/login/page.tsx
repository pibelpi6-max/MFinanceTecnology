"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { setLocale } from "@/app/actions";
import { BRAND } from "@/config/brand";
import type { SupportedLocale } from "@/i18n/request";
import "./login.css";

const LOCALES: { code: SupportedLocale; label: string }[] = [
  { code: "pt-BR", label: "PT" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
];

// ── Ícones ───────────────────────────────────────────
const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M7 16l4-5 3 3 5-7" />
  </svg>
);
const IconMail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" />
  </svg>
);
const IconLock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconEye = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ── Overlay de redirecionamento (onda de letras, mesma
// linguagem visual do loading do /admin) ─────────────
function RedirectingOverlay() {
  const letters = BRAND.name.split("");
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(244,246,251,0.85)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 1 }}>
          {letters.map((char, i) => (
            <span
              key={i}
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: ".08em",
                color: "#999",
                animation: "loginLetterWave 2s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            >
              {char}
            </span>
          ))}
        </div>
        <div
          style={{
            height: 2,
            width: `${letters.length * 14}px`,
            borderRadius: 2,
            background: `linear-gradient(90deg, transparent 0%, ${BRAND.primary} 50%, transparent 100%)`,
            backgroundSize: "300% 100%",
            animation: "loginBarShimmer 1.4s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes loginLetterWave {
          0%   { color: #999; text-shadow: none; }
          15%  { color: ${BRAND.primary}; text-shadow: 0 0 12px rgba(${BRAND.primaryRgb}, 0.55); }
          40%  { color: #ccc; text-shadow: none; }
          100% { color: #999; text-shadow: none; }
        }
        @keyframes loginBarShimmer {
          0%   { background-position: 150% center; }
          100% { background-position: -150% center; }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  const pathname = usePathname();
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();

  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  const [wordLeaving, setWordLeaving] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<SupportedLocale | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tagWords = (t.raw("tagWords") as string[]) ?? [];
  const displayLocale = pendingLocale ?? locale;

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setReady(true), 32);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (tagWords.length === 0) return;
    const interval = setInterval(() => {
      setWordLeaving(true);
      setTimeout(() => {
        setWordIndex((i) => (i + 1) % tagWords.length);
        setWordLeaving(false);
      }, 320);
    }, 2000);
    return () => clearInterval(interval);
  }, [tagWords.length]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  function mapError(message: string): string {
    if (message.includes("Invalid login credentials")) return t("invalidCredentials");
    if (message.includes("Email not confirmed")) return t("emailNotConfirmed");
    if (message.includes("Too many requests")) return t("tooManyRequests");
    return t("generic");
  }

  function switchLocale(next: SupportedLocale) {
    if (next === displayLocale) return;
    setPendingLocale(next);
    startTransition(() => setLocale(next, pathname));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError(t("invalidEmail"));
      return;
    }

    setLoading(true);
    let didRedirect = false;
    let safetyTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      safetyTimeout = setTimeout(() => {
        if (!didRedirect) {
          setLoading(false);
          setError(t("connectionTimeout"));
        }
      }, 12000);

      const supabase = createClient();
      const authPromise = supabase.auth.signInWithPassword({ email, password });
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 15000);
      });
      const { data, error: authError } = await Promise.race([authPromise, timeout]);

      if (authError) {
        setError(mapError(authError.message));
        return;
      }
      if (!data?.session) {
        setError(mapError("Invalid login credentials"));
        return;
      }

      if (rememberMe) sessionStorage.removeItem("sf:session-only");
      else sessionStorage.setItem("sf:session-only", "1");

      setRedirecting(true);
      didRedirect = true;
      // Navegação "dura" (não router.push): descarta o Router Cache do
      // Next.js e qualquer estado client-side da sessão anterior.
      window.location.href = "/admin";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg === "AUTH_TIMEOUT" ? t("connectionTimeout") : t("generic"));
    } finally {
      clearTimeout(safetyTimeout);
      if (!didRedirect) setLoading(false);
    }
  }

  const activeIndex = LOCALES.findIndex((l) => l.code === displayLocale);

  return (
    <div className={`login-wrapper${ready ? " ready" : ""}`}>
      {redirecting && <RedirectingOverlay />}

      {/* ══ ESQUERDA ══════════════════════════════ */}
      <div className="login-left">
        <div className="login-left-bg">
          <div className="deco deco-1" />
          <div className="deco deco-2" />
          <div className="deco deco-3" />
        </div>

        <div className="login-left-content">
          <div className="brand-mark">
            <div className="brand-icon"><IconChart /></div>
            <span className="brand-name">Sistema<span>Financeiro</span></span>
          </div>

          <div className="left-center">
            <h1 className="tagline">
              <span>{t("tagLine1")}</span>
              <span>
                {t("tagLine2Pre")}
                {tagWords.length > 0 && (
                  <em className={wordLeaving ? "tagline-em leaving" : "tagline-em"} key={wordIndex}>
                    {tagWords[wordIndex]}.
                  </em>
                )}
              </span>
            </h1>
            <p className="left-desc">{t("tagDesc")}</p>
          </div>

          <div className="left-bottom">
            <div className="bottom-line" />
            <span className="bottom-text">{t("tagFooter")}</span>
          </div>
        </div>
      </div>

      {/* ══ DIREITA ═══════════════════════════════ */}
      <div className="login-right">
        <div className="form-card">
          <div className="form-header">
            <p className="form-pretitle">{t("pretitle")}</p>
            <h2 className="form-title">{t("title")}</h2>
            <p className="form-subtitle">{t("subtitle")}</p>
          </div>

          {mounted && createPortal(
            <div className={`error-banner${error ? " visible" : ""}`}>
              <IconAlert />
              <span>{error}</span>
            </div>,
            document.body
          )}

          <div className="prefs-row">
            <div className="pref-group">
              <span className="pref-label">{t("localeLabel")}</span>
              <div className="seg">
                <span
                  className="seg-highlight"
                  style={{
                    width: `calc(${100 / LOCALES.length}% - 3px)`,
                    transform: `translateX(${activeIndex * 100}%)`,
                  }}
                />
                {LOCALES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    disabled={isPending}
                    className={`seg-btn${displayLocale === l.code ? " active" : ""}`}
                    onClick={() => switchLocale(l.code)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <div className="field">
                <label className="field-label">{t("email")}</label>
                <div className="field-wrap">
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    spellCheck={false}
                  />
                  <span className="field-icon"><IconMail /></span>
                </div>
              </div>

              <div className="field">
                <label className="field-label">{t("password")}</label>
                <div className="field-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <span className="field-icon"><IconLock /></span>
                  <button
                    type="button"
                    className="pwd-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  >
                    {showPassword ? <IconEye /> : <IconEyeOff />}
                  </button>
                </div>
              </div>
            </div>

            <div className="form-options">
              <label className="remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="remember-label">{t("rememberMe")}</span>
              </label>
              <span className="forgot-link" style={{ cursor: "default", opacity: 0.4 }}>
                {t("forgotPassword")}
              </span>
            </div>

            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? <span className="spinner" /> : <span>{t("signIn")}</span>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
