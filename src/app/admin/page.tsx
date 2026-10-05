import { getTranslations } from "next-intl/server";

export default async function AdminDashboardPage() {
  const t = await getTranslations("nav");

  return (
    <>
      <div className="admin-subheader">
        <div>
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
