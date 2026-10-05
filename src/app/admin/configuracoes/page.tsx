import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypes, getDimensionTree } from "@/lib/dimensions/queries";
import { getTenantSettings } from "@/lib/settings/queries";
import type { DimensionNodeRow } from "@/lib/dimensions/types";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const year = new Date().getFullYear();

  const [dimensionTypes, settings] = await Promise.all([
    getDimensionTypes(tenant.tenantId),
    getTenantSettings(tenant.tenantId),
  ]);

  // A árvore de itens de cada dimensão é carregada de uma vez só aqui
  // (em vez de sob demanda) pra manter o "Estrutura" de cada linha
  // abrindo instantaneamente — ver claude/decisoes-arquitetura.md.
  const nodeLists = await Promise.all(
    dimensionTypes.map((d) => getDimensionTree(tenant.tenantId, d.id, year))
  );
  const nodesByType: Record<string, DimensionNodeRow[]> = {};
  dimensionTypes.forEach((d, i) => {
    nodesByType[d.id] = nodeLists[i];
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
          nodesByType={nodesByType}
          year={year}
          fiscalYearStartMonth={settings.fiscalYearStartMonth}
          isAdmin={tenant.role === "admin"}
        />
      </div>
    </>
  );
}
