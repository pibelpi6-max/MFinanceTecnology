import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getOrcamentoById } from "@/lib/orcamentos/queries";
import { BackToMapLink } from "@/components/orcamentos/BackToMapLink";
import { ModuleTitle } from "@/components/orcamentos/ModuleTitle";
import { getOrcamentoModule } from "@/lib/orcamentos/modules";

interface PageProps {
  params: { id: string; modulo: string };
}

export default async function OrcamentoModuloPage({ params }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const mod = getOrcamentoModule(params.modulo);
  if (!mod) notFound();
  const orcamento = await getOrcamentoById(tenant.tenantId, params.id).catch(() => null);
  if (!orcamento) notFound();

  const t = await getTranslations("orcamentos");

  return (
    <>
      <div className="admin-subheader">
        <div className="orc-area-heading">
          <ModuleTitle slug={mod.slug} />
        </div>
        <div className="admin-page-actions">
          <BackToMapLink orcamentoId={orcamento.id} label={t("backToMap")} />
        </div>
      </div>
      <div className="admin-content">
        <div className="orc-panel orc-panel--scroll">
          <div className="orc-module-empty">
            <strong>{t("moduleInProgress")}</strong>
            <p>{mod.description}</p>
            <span>{t("moduleInProgressHint")}</span>
          </div>
        </div>
      </div>
    </>
  );
}
