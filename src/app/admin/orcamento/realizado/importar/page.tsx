import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import { ImportRealizadoClient } from "./ImportRealizadoClient";

interface PageProps {
  searchParams: { ano?: string };
}

export default async function ImportarRealizadoPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const year = Number(searchParams.ano) || new Date().getFullYear();

  const [contaType, centroCustoType, entidadeType] = await Promise.all([
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.CONTA),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.CENTRO_CUSTO),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.ENTIDADE),
  ]);

  const [accountNodes, costCenterNodes, entityNodes] = await Promise.all([
    contaType ? getDimensionTree(tenant.tenantId, contaType.id, year) : Promise.resolve([]),
    centroCustoType ? getDimensionTree(tenant.tenantId, centroCustoType.id, year) : Promise.resolve([]),
    entidadeType ? getDimensionTree(tenant.tenantId, entidadeType.id, year) : Promise.resolve([]),
  ]);

  const t = await getTranslations("import");
  const tActuals = await getTranslations("actuals");

  return (
    <>
      <div className="admin-subheader">
        <div>
          <h1 className="admin-page-title">
            {t("titlePrefix")} {tActuals("title")}
          </h1>
        </div>
      </div>
      <div className="admin-content admin-content--scroll">
        <div className="admin-table-card">
          <ImportRealizadoClient
            referenceYear={year}
            accountNodes={accountNodes.map((n) => ({ id: n.id, code: n.code, name: n.name }))}
            costCenterNodes={costCenterNodes.map((n) => ({ id: n.id, code: n.code, name: n.name }))}
            entityNodes={entityNodes.map((n) => ({ id: n.id, code: n.code, name: n.name }))}
          />
        </div>
      </div>
    </>
  );
}
