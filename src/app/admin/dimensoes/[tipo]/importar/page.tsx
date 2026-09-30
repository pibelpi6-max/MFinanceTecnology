import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { ImportDimensaoClient } from "./ImportDimensaoClient";

interface PageProps {
  params: { tipo: string };
  searchParams: { ano?: string };
}

export default async function ImportarDimensaoPage({ params, searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const dimensionType = await getDimensionTypeByCode(tenant.tenantId, params.tipo);
  if (!dimensionType) notFound();

  const year = Number(searchParams.ano) || new Date().getFullYear();
  const nodes = await getDimensionTree(tenant.tenantId, dimensionType.id, year);
  const t = await getTranslations("import");

  return (
    <>
      <div className="admin-subheader">
        <div>
          <h1 className="admin-page-title">
            {t("titlePrefix")} {dimensionType.name}
          </h1>
        </div>
      </div>
      <div className="admin-content admin-content--scroll">
        <div className="admin-table-card">
          <ImportDimensaoClient
            dimensionTypeId={dimensionType.id}
            dimensionTypeName={dimensionType.name}
            year={year}
            tipo={params.tipo}
            existingNodes={nodes.map((n) => ({ id: n.id, code: n.code, name: n.name }))}
          />
        </div>
      </div>
    </>
  );
}
