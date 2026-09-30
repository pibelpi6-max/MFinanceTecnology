import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { ImportLinkButton } from "@/components/import/ImportLinkButton";
import { DimensionTreeClient } from "./DimensionTreeClient";
import { YearSelect } from "./YearSelect";

interface PageProps {
  params: { tipo: string };
  searchParams: { ano?: string };
}

export default async function DimensionTypePage({ params, searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const dimensionType = await getDimensionTypeByCode(tenant.tenantId, params.tipo);
  if (!dimensionType) notFound();

  const year = Number(searchParams.ano) || new Date().getFullYear();
  const nodes = await getDimensionTree(tenant.tenantId, dimensionType.id, year);
  const t = await getTranslations("dimensions");

  return (
    <>
      <div className="admin-subheader">
        <div>
          <h1 className="admin-page-title">{dimensionType.name}</h1>
        </div>
        <div className="admin-page-actions">
          <span className="text-xs font-medium text-gray-400">{t("year")}</span>
          <YearSelect year={year} tipo={params.tipo} />
          <ImportLinkButton href={`/admin/dimensoes/${params.tipo}/importar?ano=${year}`} label={t("importButton")} />
        </div>
      </div>
      <div className="admin-content">
        <div className="admin-table-card">
          <DimensionTreeClient
            dimensionTypeId={dimensionType.id}
            dimensionTypeName={dimensionType.name}
            year={year}
            nodes={nodes}
          />
        </div>
      </div>
    </>
  );
}
