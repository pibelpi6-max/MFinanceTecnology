"use client";
import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import type { SupportedLocale } from "@/i18n/request";

const FlagBR = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 14" style={{ display: "block", borderRadius: "50%", width: 22, height: 22 }}>
    <rect width="20" height="14" fill="#009c3b" />
    <polygon points="10,1.5 18.5,7 10,12.5 1.5,7" fill="#fedf00" />
    <circle cx="10" cy="7" r="3.2" fill="#002776" />
    <path d="M7 6.4 Q10 5 13 6.4" stroke="white" strokeWidth="0.6" fill="none" />
  </svg>
);

const FlagUS = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 14" style={{ display: "block", borderRadius: "50%", width: 22, height: 22 }}>
    <rect width="20" height="14" fill="#fff" />
    {[0, 2, 4, 6, 8, 10, 12].map((y) => (
      <rect key={y} y={y} width="20" height="1.077" fill="#b22234" />
    ))}
    <rect width="9" height="7.5" fill="#3c3b6e" />
  </svg>
);

const FlagES = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 14" style={{ display: "block", borderRadius: "50%", width: 22, height: 22 }}>
    <rect width="20" height="14" fill="#aa151b" />
    <rect y="3.5" width="20" height="7" fill="#f1bf00" />
  </svg>
);

const FLAGS: Record<SupportedLocale, () => React.ReactElement> = {
  "pt-BR": FlagBR,
  en: FlagUS,
  es: FlagES,
};

export function AdminHeader() {
  useSessionGuard();
  const t = useTranslations("nav");
  const pathname = usePathname();
  const locale = useLocale() as SupportedLocale;
  const [, startTransition] = useTransition();
  const [optimisticLocale, setOptimisticLocale] = useState<SupportedLocale | null>(null);
  const displayLocale = optimisticLocale ?? locale;

  function handleLocale(loc: SupportedLocale) {
    setOptimisticLocale(loc);
    startTransition(() => setLocale(loc, pathname));
  }

  return (
    <header className="admin-topbar">
      <div className="admin-flags">
        {(Object.keys(FLAGS) as SupportedLocale[]).map((loc) => {
          const Flag = FLAGS[loc];
          const labelKey = loc === "pt-BR" ? "langPT" : loc === "en" ? "langEN" : "langES";
          return (
            <button
              key={loc}
              className={`flag-btn${displayLocale === loc ? " active" : ""}`}
              onClick={() => handleLocale(loc)}
              title={t(labelKey)}
            >
              <Flag />
            </button>
          );
        })}
      </div>

      <div className="admin-header-sep" />
      <div className="admin-topbar-logo">
        Sistema<span>Financeiro</span>
      </div>
    </header>
  );
}
