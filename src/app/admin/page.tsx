import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";

export default async function AdminDashboardPage() {
  const t = await getTranslations("nav");
  const tenant = await getCurrentTenant();

  return (
    <>
      <div className="admin-subheader">
        <div>
          <p className="admin-page-crumb">{tenant?.tenantName}</p>
          <h1 className="admin-page-title">{t("dashboard")}</h1>
        </div>
      </div>
      <div className="admin-content">
        <div className="admin-table-card" style={{ alignItems: "center", justifyContent: "center", padding: 40 }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
            O painel com os indicadores do orçamento chega em breve.
          </p>
        </div>
      </div>
    </>
  );
}
