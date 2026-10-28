import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getOrcamentoById, getOrcamentosByTenant } from "@/lib/orcamentos/queries";
import { getDimensionTypeByCode, getDimensionTree, getDimensionTypes } from "@/lib/dimensions/queries";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import { buildDimensionHierarchy } from "@/lib/dimensions/hierarchy";
import { getDeductionDefaults, getDeductionLabels, getDeductionRules, getItemKinds, getPremises, getReceitaData, getReferenceEntries, getRevenueDimensionIds } from "@/lib/receita/queries";
import { BackToMapLink } from "@/components/orcamentos/BackToMapLink";
import { ModuleTitle } from "@/components/orcamentos/ModuleTitle";
import { getUserPreference } from "@/app/_actions/userPreferences";
import type { TablePrefs } from "@/components/ui/DataTable/types";
import { ReceitaSetup } from "./ReceitaSetup";
import { ReceitaClient, type ProductRow } from "./ReceitaClient";

interface PageProps {
  params: { id: string };
  searchParams: { moeda?: string };
}

export default async function ReceitaPage({ params, searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();
  const orcamento = await getOrcamentoById(tenant.tenantId, params.id).catch(() => null);
  if (!orcamento) notFound();

  const productPrefs = await getUserPreference<TablePrefs>("receita_produtos_cols").catch(() => null);
  const t = await getTranslations("receita");
  const tOrc = await getTranslations("orcamentos");

  const [produtoType, allTypes] = await Promise.all([
    getDimensionTypeByCode(tenant.tenantId, DIMENSION_CODES.PRODUTO),
    getDimensionTypes(tenant.tenantId),
  ]);
  // Hierarquias pelas quais a receita pode ser lançada/condicionada (Produto tem coluna própria).
  const excluded: string[] = [DIMENSION_CODES.PRODUTO];
  const dimTypes = allTypes.filter((d) => !excluded.includes(d.code));
  const conjunto = orcamento.conjunto_estrutura_id;
  const [productNodes, treesByType] = await Promise.all([
    produtoType ? getDimensionTree(tenant.tenantId, produtoType.id, orcamento.year, conjunto) : Promise.resolve([]),
    Promise.all(dimTypes.map((d) => getDimensionTree(tenant.tenantId, d.id, orcamento.year, conjunto))),
  ]);
  const hierarchies = treesByType.map((nodes) => buildDimensionHierarchy(nodes).rows);
  const ruleGroups = dimTypes.map((d, i) => ({
    typeId: d.id,
    name: d.name,
    items: hierarchies[i].map((r) => ({ id: r.item.id, name: r.item.name, parentId: r.item.parentNodeId })),
  }));
  // Itens de cada hierarquia (com nível) para os seletores de recorte e o "Detalhar por".
  const dimNodes = Object.fromEntries(
    dimTypes.map((d, i) => [d.id, hierarchies[i].map((r) => ({ id: r.item.id, name: r.item.name, depth: r.depth, parentId: r.item.parentNodeId }))]),
  );
  const defaultTypeId = (dimTypes.find((d) => d.code === DIMENSION_CODES.ENTIDADE) ?? dimTypes[0])?.id ?? null;
  const savedCarried = (await getRevenueDimensionIds(tenant.tenantId, orcamento.id)).filter((id) => dimTypes.some((d) => d.id === id));

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
        <div className="admin-content admin-content--flush">
          <div className="orc-panel orc-panel--scroll orc-panel--flush">
            <ReceitaSetup orcamentoId={orcamento.id} />
          </div>
        </div>
      </>
    );
  }

  const [kinds, deductionLabels, deductionDefaults, deductionRules] = await Promise.all([
    getItemKinds(tenant.tenantId),
    getDeductionLabels(tenant.tenantId),
    getDeductionDefaults(tenant.tenantId),
    getDeductionRules(tenant.tenantId),
  ]);
  const hierarchy = buildDimensionHierarchy(productNodes);
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
  const premises = await getPremises(tenant.tenantId, orcamento.id);
  const budgetOptions = (await getOrcamentosByTenant(tenant.tenantId).catch(() => []))
    .filter((o) => o.id !== orcamento.id)
    .map((o) => ({ id: o.id, label: o.label, year: o.year }));
  const refIds = Array.from(new Set(premises.filter((x) => x.isActive && x.base === "other_budget" && x.baseOrcamentoId).map((x) => x.baseOrcamentoId as string)));
  const refEntries = await getReferenceEntries(tenant.tenantId, refIds);
  const data = await getReceitaData(tenant.tenantId, orcamento.id, orcamento.year);
  const displayCurrency = data.currencies.includes(searchParams.moeda ?? "") ? (searchParams.moeda as string) : "BRL";

  return (
    <>
      {header}
      <div className="admin-content admin-content--flush">
        <div className="orc-panel orc-panel--scroll orc-panel--flush">
          <ReceitaClient
            orcamentoId={orcamento.id}
            year={orcamento.year}
            productTypeId={produtoType!.id}
            productPrefs={productPrefs ?? undefined}
            deductionLabels={deductionLabels}
            deductionDefaults={deductionDefaults}
            deductionRules={deductionRules}
            products={products}
            dimensions={dimTypes.map((d) => ({ id: d.id, name: d.name }))}
            dimNodes={dimNodes}
            savedCarried={savedCarried}
            defaultTypeId={defaultTypeId}
            ruleGroups={ruleGroups}
            premises={premises}
            budgetOptions={budgetOptions}
            refEntries={refEntries}
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
