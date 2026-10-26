import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import {
  getConjuntosByTenant,
  getOrcamentoAtualId,
  getOrcamentosByTenant,
  getPackageCountsByOrcamento,
} from "@/lib/orcamentos/queries";
import { OrcamentosClient } from "./OrcamentosClient";

export default async function OrcamentosPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const [orcamentos, conjuntos, packageCounts, atualId, t] = await Promise.all([
    getOrcamentosByTenant(tenant.tenantId),
    getConjuntosByTenant(tenant.tenantId),
    getPackageCountsByOrcamento(tenant.tenantId),
    getOrcamentoAtualId(tenant.tenantId),
    getTranslations("orcamentos"),
  ]);

  return (
    <OrcamentosClient
      tenantId={tenant.tenantId}
      isAdmin={tenant.role === "admin"}
      orcamentos={orcamentos}
      conjuntos={conjuntos}
      packageCounts={packageCounts}
      currentId={atualId}
      title={t("title")}
      subtitle={t("subtitle")}
    />
  );
}
