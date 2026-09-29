"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IBM_Plex_Sans } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { setLocale } from "@/app/actions";
import { BRAND } from "@/config/brand";
import type { SupportedLocale } from "@/i18n/request";
import "./login.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--login-font",
});

const LOCALES: { code: SupportedLocale; label: string }[] = [
  { code: "pt-BR", label: "PT" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
];

const SLIDE_COUNT = 3;
const SLIDE_INTERVAL_MS = 4200;
const FADE_MS = 320;

type Slide = { title: string; desc: string; badge: string };

// ── Ícones ───────────────────────────────────────────
const IconBriefcase = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19V6.5A1.5 1.5 0 0 1 5.5 5h6L14 7.5h4.5A1.5 1.5 0 0 1 20 9v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
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

// ── Mockup de dados do painel esquerdo — puramente
// decorativo (não são dados reais da conta) ──────────
function VisualMatrix({ t }: { t: (key: string) => string }) {
  return (
    <div className="visual-panel">
      <div className="visual-panel-head">
        <span>{t("visual.matrixTitle")}</span>
        <span className="visual-muted">{t("visual.consolidated")}</span>
      </div>
      <table className="visual-table">
        <thead>
          <tr>
            <td />
            <td>{t("visual.colSP")}</td>
            <td>{t("visual.colRJ")}</td>
            <td>{t("visual.colHQ")}</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="visual-row-label">{t("visual.rowRevenue")}</td>
            <td>842.300</td><td>613.900</td><td>1.240.500</td>
          </tr>
          <tr>
            <td className="visual-row-label">{t("visual.rowCosts")}</td>
            <td>521.100</td><td>398.200</td><td>803.400</td>
          </tr>
          <tr className="visual-row-strong">
            <td className="visual-row-label">{t("visual.rowResult")}</td>
            <td>321.200</td><td>215.700</td><td>437.100</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function VisualConsolidation({ t }: { t: (key: string) => string }) {
  const rows = [
    { label: t("visual.colHQ"), value: "437.100", pct: 100, color: "#1B2559" },
    { label: t("visual.colSP"), value: "321.200", pct: 73, color: "#4F8FE8" },
    { label: t("visual.colRJ"), value: "215.700", pct: 49, color: "#8FB4F0" },
  ];
  return (
    <div className="visual-panel">
      <span className="visual-panel-title">{t("visual.consolidationTitle")}</span>
      <div className="visual-bars">
        {rows.map((r) => (
          <div key={r.label} className="visual-bar-row">
            <div className="visual-bar-labels">
              <span>{r.label}</span>
              <span className="visual-row-strong-text">{r.value}</span>
            </div>
            <div className="visual-bar-track">
              <div className="visual-bar-fill" style={{ width: `${r.pct}%`, background: r.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisualBudgetVsActual({ t }: { t: (key: string) => string }) {
  const rows = [
    { label: t("visual.rowRevenue"), value: "842.300", delta: "▲5,3%", up: true },
    { label: t("visual.rowCosts"), value: "521.100", delta: "▼3,5%", up: false },
    { label: t("visual.rowResult"), value: "321.200", delta: "▲23,5%", up: true, strong: true },
  ];
  return (
    <div className="visual-panel">
      <span className="visual-panel-title">{t("visual.budgetActualTitle")}</span>
      <div className="visual-compare">
        {rows.map((r) => (
          <div key={r.label} className={`visual-compare-row${r.strong ? " visual-row-strong" : ""}`}>
            <span>{r.label}</span>
            <span>
              {r.value} <span className="visual-delta">{r.delta}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const pathname = usePathname();
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();

  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<SupportedLocale | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slide, setSlide] = useState(0);
  const [fading, setFading] = useState(false);
  const fadeTimeout = useRef<ReturnType<typeof setTimeout>>();

  const slides = (t.raw("slides") as Slide[]) ?? [];
  const displayLocale = pendingLocale ?? locale;

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setReady(true), 32);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      fadeTimeout.current = setTimeout(() => {
        setSlide((i) => (i + 1) % SLIDE_COUNT);
        setFading(false);
      }, FADE_MS);
    }, SLIDE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(fadeTimeout.current);
    };
  }, []);

  function goToSlide(i: number) {
    if (i === slide) return;
    setFading(true);
    fadeTimeout.current = setTimeout(() => {
      setSlide(i);
      setFading(false);
    }, FADE_MS);
  }

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

  const current = slides[slide];
  const fadeClass = fading ? " fading" : "";

  return (
    <div className={`login-wrapper ${plexSans.variable}${ready ? " ready" : ""}`}>
      {redirecting && <RedirectingOverlay />}

      {/* ══ ESQUERDA — painel de marca ═══════════════ */}
      <div className="login-left">
        <div className="login-left-bg" />
        <div className="login-glow login-glow-1" />
        <div className="login-glow login-glow-2" />

        <div className="login-left-content">
          <div className="enter enter-1">
            <span className="brand-label">{t("brandLabel")}</span>
          </div>

          <div className="enter enter-2 headline-block">
            <h1 className="headline">{t("headline")}</h1>
            <p className="headline-desc">{t("headlineDesc")}</p>
          </div>

          <div className={`enter-card visual-card${fadeClass}`}>
            <div className="visual-badge">{current?.badge}</div>
            <div className="visual-body">
              {slide === 0 && <VisualMatrix t={t} />}
              {slide === 1 && <VisualConsolidation t={t} />}
              {slide === 2 && <VisualBudgetVsActual t={t} />}
            </div>
          </div>

          <div className={`carousel-text${fadeClass}`}>
            <div className="carousel-copy">
              <p className="carousel-title">{current?.title}</p>
              <p className="carousel-desc">{current?.desc}</p>
            </div>
            <div className="carousel-dots">
              {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Slide ${i + 1}`}
                  className={`carousel-dot${slide === i ? " active" : ""}`}
                  onClick={() => goToSlide(i)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ DIREITA — formulário ══════════════════════ */}
      <div className="login-right">
        <div className="prefs-row">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              disabled={isPending}
              className={`locale-link${displayLocale === l.code ? " active" : ""}`}
              onClick={() => switchLocale(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="form-card">
          <div className="enter enter-1 form-brand">
            <span className="form-brand-icon"><IconBriefcase /></span>
            <span className="form-brand-name">{t("brandLabel")}</span>
          </div>

          <div className="enter enter-2 form-header">
            <h2 className="form-title">{t("welcomeTitle")}</h2>
            <p className="form-subtitle">{t("welcomeSubtitle")}</p>
          </div>

          {mounted && createPortal(
            <div className={`error-banner${error ? " visible" : ""}`}>
              <IconAlert />
              <span>{error}</span>
            </div>,
            document.body
          )}

          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <div className="field enter enter-3">
                <label className="field-label" htmlFor="sf-email">{t("email")}</label>
                <input
                  id="sf-email"
                  className="field-input"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  spellCheck={false}
                />
              </div>

              <div className="field enter enter-4">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="sf-password">{t("password")}</label>
                  <span className="forgot-link" style={{ cursor: "default", opacity: 0.55 }}>
                    {t("forgotPassword")}
                  </span>
                </div>
                <div className="field-wrap">
                  <input
                    id="sf-password"
                    className="field-input"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: 64 }}
                  />
                  <button
                    type="button"
                    className="pwd-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? t("hidePassword") : t("showPassword")}
                  </button>
                </div>
              </div>
            </div>

            <label className="remember enter enter-4">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="remember-label">{t("rememberMe")}</span>
            </label>

            <div className="enter enter-5">
              <button type="submit" disabled={loading} className="btn-submit">
                {loading ? <span className="spinner" /> : <span>{t("signIn")}</span>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
