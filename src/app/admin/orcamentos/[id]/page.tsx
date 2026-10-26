import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import {
  getConjuntosByTenant,
  getOrcamentoAtualId,
  getOrcamentoById,
  getPackageCountsByOrcamento,
} from "@/lib/orcamentos/queries";
import { OrcamentoAreaClient } from "./OrcamentoAreaClient";

interface PageProps {
  params: { id: string };
}

export default async function OrcamentoAreaPage({ params }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const orcamento = await getOrcamentoById(tenant.tenantId, params.id).catch(() => null);
  if (!orcamento) notFound();

  const [conjuntos, packageCounts, atualId] = await Promise.all([
    getConjuntosByTenant(tenant.tenantId),
    getPackageCountsByOrcamento(tenant.tenantId),
    getOrcamentoAtualId(tenant.tenantId),
  ]);

  return (
    <OrcamentoAreaClient
      tenantId={tenant.tenantId}
      isAdmin={tenant.role === "admin"}
      orcamento={orcamento}
      conjuntos={conjuntos}
      packageCount={packageCounts[orcamento.id] ?? 0}
      isCurrent={atualId === orcamento.id}
    />
  );
}
