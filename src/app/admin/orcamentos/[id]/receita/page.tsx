import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getOrcamentoById } from "@/lib/orcamentos/queries";
import { getDimensionTypeByCode, getDimensionTree } from "@/lib/dimensions/queries";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import { buildDimensionHierarchy } from "@/lib/dimensions/hierarchy";
import { getReceitaData } from "@/lib/receita/queries";
import { BackToMapLink } from "@/components/orcamentos/BackToMapLink";
import { ModuleTitle } from "@/components/orcamentos/ModuleTitle";
import { ReceitaClient, type ProductRow } from "./ReceitaClient";

interface PageProps {
  params: { id: string };
  searchParams: { entidade?: string; moeda?: string };
}

export default async function ReceitaPage({ params, searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();
  const orcamento = await getOrcamentoById(tenant.tenantId, params.id).catch(() => null);
  if (!orcamento) notFound();

  const t = await getTranslations("receita");
  const tOrc = await getTranslations("orcamentos");

  const [produtoType, entidadeType] = await Promise.all([
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.PRODUTO),
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.ENTIDADE),
  ]);
  const conjunto = orcamento.conjunto_estrutura_id;
  const [productNodes, entityNodes] = await Promise.all([
    produtoType ? getDimensionTree(tenant.tenantId, produtoType.id, orcamento.year, conjunto) : Promise.resolve([]),
    entidadeType ? getDimensionTree(tenant.tenantId, entidadeType.id, orcamento.year, conjunto) : Promise.resolve([]),
  ]);

  const header = (
    <div className="admin-subheader">
      <div className="orc-area-heading">
        <ModuleTitle slug="receita" />
      </div>
      <div className="admin-page-actions">
        <BackToMapLink orcamentoId={orcamento.id} label={tOrc("backToMap")} />
      </div>
    </div>
  );

  if (productNodes.length === 0) {
    return (
      <>
        {header}
        <div className="admin-content">
          <div className="orc-panel orc-panel--scroll">
            <div className="orc-module-empty">
              <strong>{t("noProductsTitle")}</strong>
              <p>{t("noProductsBody")}</p>
              <Link href="/admin/configuracoes" className="rec-chip">{t("goToParams")}</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const hierarchy = buildDimensionHierarchy(productNodes);
  const products: ProductRow[] = hierarchy.rows.map((r) => ({
    id: r.item.id,
    name: r.item.name,
    depth: r.depth,
    parentId: r.item.parentNodeId,
    isLeaf: !hierarchy.hasChildren.has(r.item.id),
  }));
  const entities = buildDimensionHierarchy(entityNodes).rows.map((r) => ({ id: r.item.id, name: r.item.name }));
  const entityId =
    searchParams.entidade === "all" || entities.some((e) => e.id === searchParams.entidade)
      ? (searchParams.entidade as string)
      : entities.length > 0
        ? entities[0].id
        : "all";

  const data = await getReceitaData(tenant.tenantId, orcamento.id, orcamento.year);
  const displayCurrency = data.currencies.includes(searchParams.moeda ?? "") ? (searchParams.moeda as string) : "BRL";

  return (
    <>
      {header}
      <div className="admin-content">
        <div className="orc-panel orc-panel--scroll">
          <ReceitaClient
            orcamentoId={orcamento.id}
            year={orcamento.year}
            products={products}
            entities={entities}
            entityId={entityId}
            displayCurrency={displayCurrency}
            currencies={data.currencies}
            entries={data.entries}
            deductions={data.deductions}
            rates={data.rates}
          />
        </div>
      </div>
    </>
  );
}
