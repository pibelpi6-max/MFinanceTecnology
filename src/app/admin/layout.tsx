import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getUserPreference } from "@/app/_actions/userPreferences";
import { getTenantLabels } from "@/lib/labels/getTenantLabels";
import { getOrcamentosByTenant, getOrcamentoAtualId } from "@/lib/orcamentos/queries";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import "./admin.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tenant = await getCurrentTenant();
  if (!tenant) {
    return (
      <div className="admin-shell" style={{ alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-content)", fontSize: 14 }}>
          Sua conta ainda não está vinculada a nenhuma empresa. Fale com o administrador do sistema.
        </p>
      </div>
    );
  }

  const locale = await getLocale();
  const [labels, collapsedPref, orcamentos, orcamentoAtualId] = await Promise.all([
    getTenantLabels(tenant.tenantId, locale),
    getUserPreference<{ collapsed: boolean }>(`sidebar_collapsed:${tenant.tenantId}`),
    getOrcamentosByTenant(tenant.tenantId),
    getOrcamentoAtualId(tenant.tenantId),
  ]);
  // Se a preferência apontar pra um Orçamento que não existe mais (excluído
  // em outra aba, por exemplo), o seletor cai no "Sem Orçamento" em vez de
  // mostrar um id órfão — mesma salvaguarda de getOrcamentoContext.
  const currentOrcamentoId = orcamentos.some((o) => o.id === orcamentoAtualId) ? orcamentoAtualId : null;

  return (
    <div className="admin-shell">
      <AdminSidebar
        userEmail={tenant.userEmail}
        tenantId={tenant.tenantId}
        packageLabelPlural={labels.budgetPackagePlural}
        initialCollapsed={collapsedPref?.collapsed ?? false}
      />
      <div className="admin-main">
        <AdminHeader orcamentos={orcamentos} currentOrcamentoId={currentOrcamentoId} />
        <main className="admin-page-content">{children}</main>
      </div>
    </div>
  );
}
