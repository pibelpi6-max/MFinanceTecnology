import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypes, getDimensionStructuresByType, getDimensionTreeByStructure } from "@/lib/dimensions/queries";
import { getTenantSettings } from "@/lib/settings/queries";
import { getConjuntosByTenant } from "@/lib/orcamentos/queries";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";
import type { DimensionNodeRow } from "@/lib/dimensions/types";
import { getErpCodesByNode } from "@/lib/dimensions/erpCodesQueries";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const year = new Date().getFullYear();

  const [allDimensionTypes, settings, structuresByType, conjuntos, erpCodesByNode] = await Promise.all([
    getDimensionTypes(tenant.tenantId),
    getTenantSettings(tenant.tenantId),
    getDimensionStructuresByType(tenant.tenantId),
    getConjuntosByTenant(tenant.tenantId),
    getErpCodesByNode(tenant.tenantId),
  ]);

  // Produto pertence só aos módulos de Receita e Custos (gerenciado lá); não é uma hierarquia de Parâmetros.
  const dimensionTypes = allDimensionTypes.filter((d) => d.code !== DIMENSION_CODES.PRODUTO);

  // A árvore de itens de cada Estrutura é carregada de uma vez só aqui
  // (em vez de sob demanda) pra manter o painel "Estruturas" de cada
  // linha abrindo instantaneamente — ver claude/decisoes-arquitetura.md.
  const allStructures = Object.values(structuresByType).flat();
  const nodeLists = await Promise.all(
    allStructures.map((s) => getDimensionTreeByStructure(tenant.tenantId, s.id, year))
  );
  const nodesByStructure: Record<string, DimensionNodeRow[]> = {};
  allStructures.forEach((s, i) => {
    nodesByStructure[s.id] = nodeLists[i];
  });

  return (
    <>
      <div className="admin-subheader">
        <div>
          <h1 className="admin-page-title">Parâmetros</h1>
        </div>
      </div>
      <div className="admin-content admin-content--scroll">
        <ConfiguracoesClient
          dimensionTypes={dimensionTypes}
          structuresByType={structuresByType}
          nodesByStructure={nodesByStructure}
          year={year}
          fiscalYearStartMonth={settings.fiscalYearStartMonth}
          isAdmin={tenant.role === "admin"}
          conjuntos={conjuntos}
          erpCodesByNode={erpCodesByNode}
        />
      </div>
    </>
  );
}
