import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypes } from "@/lib/dimensions/queries";
import { getTenantSettings } from "@/lib/settings/queries";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const [dimensionTypes, settings] = await Promise.all([
    getDimensionTypes(tenant.tenantId),
    getTenantSettings(tenant.tenantId),
  ]);

  return (
    <>
      <div className="admin-subheader">
        <div>
          <p className="admin-page-crumb">{tenant.tenantName}</p>
          <h1 className="admin-page-title">Parâmetros</h1>
        </div>
      </div>
      <div className="admin-content admin-content--scroll">
        <ConfiguracoesClient
          dimensionTypes={dimensionTypes}
          fiscalYearStartMonth={settings.fiscalYearStartMonth}
          isAdmin={tenant.role === "admin"}
        />
      </div>
    </>
  );
}
