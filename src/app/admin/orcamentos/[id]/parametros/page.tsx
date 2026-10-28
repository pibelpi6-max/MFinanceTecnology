import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getOrcamentoById } from "@/lib/orcamentos/queries";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import { buildDimensionHierarchy } from "@/lib/dimensions/hierarchy";
import { getCurrencyRates, getItemKinds, getTenantCurrencies } from "@/lib/receita/queries";
import { BackToMapLink } from "@/components/orcamentos/BackToMapLink";
import { ModuleTitle } from "@/components/orcamentos/ModuleTitle";
import { getUserPreference } from "@/app/_actions/userPreferences";
import type { TablePrefs } from "@/components/ui/DataTable/types";
import { ReceitaSetup } from "../receita/ReceitaSetup";
import { ParametrosClient } from "./ParametrosClient";
import type { ProductRow } from "../receita/ReceitaClient";

export default async function ParametrosPage({ params }: { params: { id: string } }) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();
  const orcamento = await getOrcamentoById(tenant.tenantId, params.id).catch(() => null);
  if (!orcamento) notFound();
  const tOrc = await getTranslations("orcamentos");

  const produtoType = await getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.PRODUTO);
  const [nodes, kinds, currencies, rates, prefs] = await Promise.all([
    produtoType ? getDimensionTree(tenant.tenantId, produtoType.id, orcamento.year, orcamento.conjunto_estrutura_id, true) : Promise.resolve([]),
    getItemKinds(tenant.tenantId),
    getTenantCurrencies(tenant.tenantId),
    getCurrencyRates(tenant.tenantId, orcamento.id, orcamento.year),
    getUserPreference<TablePrefs>("parametros_produtos_cols").catch(() => null),
  ]);
  const hierarchy = buildDimensionHierarchy(nodes);
  const products: ProductRow[] = hierarchy.rows.map((r) => ({
    id: r.item.id,
    name: r.item.name,
    depth: r.depth,
    parentId: r.item.parentNodeId,
    isLeaf: !hierarchy.hasChildren.has(r.item.id),
    kind: kinds[r.item.id] ?? "produto",
    code: r.item.code,
    versionId: r.item.versionId,
    validFromYear: r.item.validFromYear,
  }));

  return (
    <>
      <div className="admin-subheader">
        <div className="orc-area-heading">
          <ModuleTitle slug="parametros" />
        </div>
        <div className="admin-page-actions">
          <BackToMapLink orcamentoId={orcamento.id} label={tOrc("backToMap")} />
        </div>
      </div>
      <div className="admin-content admin-content--flush">
        <div className="orc-panel orc-panel--scroll orc-panel--flush">
          {products.length === 0 || !produtoType ? (
            <ReceitaSetup orcamentoId={orcamento.id} />
          ) : (
            <ParametrosClient
              orcamentoId={orcamento.id}
              year={orcamento.year}
              productTypeId={produtoType.id}
              products={products}
              productPrefs={prefs ?? undefined}
              currencies={currencies}
              rates={rates}
            />
          )}
        </div>
      </div>
    </>
  );
}
