"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { clearAppCaches } from "@/lib/pwa/clearCaches";
import { saveUserPreference } from "@/app/_actions/userPreferences";

interface DimensionNavItem {
  code: string;
  name: string;
}

interface AdminSidebarProps {
  userEmail: string | null;
  dimensionTypes: DimensionNavItem[];
  packageLabelPlural: string;
  initialCollapsed?: boolean;
  tenantId: string;
}

export function AdminSidebar({
  userEmail,
  dimensionTypes,
  packageLabelPlural,
  initialCollapsed = false,
  tenantId,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");

  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [dimensoesOpen, setDimensoesOpen] = useState(() => pathname.startsWith("/admin/dimensoes"));
  const [showContent, setShowContent] = useState(!initialCollapsed);

  const collapsedRef = useRef(initialCollapsed);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (collapsed === collapsedRef.current) return;
    collapsedRef.current = collapsed;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveUserPreference(`sidebar_collapsed:${tenantId}`, { collapsed });
    }, 400);
  }, [collapsed, tenantId]);

  useEffect(() => {
    if (pathname.startsWith("/admin/dimensoes")) setDimensoesOpen(true);
  }, [pathname]);

  useEffect(() => {
    router.prefetch("/admin");
    for (const d of dimensionTypes) router.prefetch(`/admin/dimensoes/${d.code}`);
  }, [router, dimensionTypes]);

  function expand() {
    setCollapsed(false);
    window.setTimeout(() => setShowContent(true), 340);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    await clearAppCaches();
    window.location.href = "/login";
  }

  function isActive(href: string, exact = false) {
    return exact ? pathname === href : pathname.startsWith(href);
  }
  const cl = (base: string, active: boolean) => `${base}${active ? " active" : ""}`;
  const dimensoesActive = pathname.startsWith("/admin/dimensoes");

  return (
    <aside
      className={`admin-sidebar${collapsed ? " collapsed" : ""}`}
      onClick={collapsed ? expand : undefined}
      style={{ cursor: collapsed ? "pointer" : "default" }}
    >
      <div className="sb-header">
        <div className="admin-av-wrap">
          <div className="admin-av">{userEmail?.[0]?.toUpperCase() ?? "U"}</div>
        </div>
        <div className="sb-profile-info" style={{ visibility: showContent ? "visible" : "hidden" }}>
          <p className="sb-profile-name">{userEmail?.split("@")[0] ?? "—"}</p>
          <p className="sb-profile-email">{userEmail ?? ""}</p>
        </div>
        <button
          className="sb-collapse-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (collapsed) expand();
            else {
              setShowContent(false);
              setCollapsed(true);
            }
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <nav className="sb-nav">
        <div className="sb-nav-scroll">
          <p className="sb-lbl">Menu</p>
          <button
            onClick={(e) => { e.stopPropagation(); router.push("/admin"); }}
            className={cl("sb-item", isActive("/admin", true))}
          >
            <svg className="sb-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
            <span className="sb-label">{t("dashboard")}</span>
          </button>

          <div className="sb-sep" />

          <button
            className={cl("sb-cfg-toggle", dimensoesActive)}
            onClick={(e) => {
              e.stopPropagation();
              if (collapsed) expand();
              setDimensoesOpen((v) => !v);
            }}
          >
            <svg className="sb-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 8.25h16.5" />
            </svg>
            <span className="sb-label sb-cfg-label">{t("dimensoes")}</span>
            <svg className={`sb-chev${dimensoesOpen ? " open" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
          </button>

          {dimensoesOpen && (
            <div className="sb-cfg-sub">
              {dimensionTypes.map((d) => (
                <button
                  key={d.code}
                  onClick={(e) => { e.stopPropagation(); router.push(`/admin/dimensoes/${d.code}`); }}
                  className={cl("sb-sub-item", isActive(`/admin/dimensoes/${d.code}`))}
                >
                  <svg className="sb-icon" style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="sb-label">{d.name}</span>
                </button>
              ))}
            </div>
          )}

          <button className="sb-item sb-item-blocked" onClick={(e) => e.stopPropagation()}>
            <svg className="sb-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
            <span className="sb-label">{packageLabelPlural}</span>
          </button>

          <div className="sb-sep" />
          <p className="sb-lbl">{t("sistema")}</p>

          <button className="sb-item sb-item-blocked" onClick={(e) => e.stopPropagation()}>
            <svg className="sb-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            <span className="sb-label">{t("configuracoes")}</span>
          </button>
        </div>
      </nav>

      <div className="sb-footer">
        <button onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="sb-logout">
          <svg className="sb-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
          </svg>
          <span className="sb-label">{t("logout")}</span>
        </button>
      </div>
    </aside>
  );
}
