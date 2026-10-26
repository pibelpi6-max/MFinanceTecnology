import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getOrcamentoAtualId, getOrcamentoById } from "@/lib/orcamentos/queries";
import { OrcamentoAreaClient } from "./OrcamentoAreaClient";

interface PageProps {
  params: { id: string };
}

export default async function OrcamentoAreaPage({ params }: PageProps) {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const orcamento = await getOrcamentoById(tenant.tenantId, params.id).catch(() => null);
  if (!orcamento) notFound();

  const atualId = await getOrcamentoAtualId(tenant.tenantId);

  return (
    <OrcamentoAreaClient
      tenantId={tenant.tenantId}
      orcamento={orcamento}
      isCurrent={atualId === orcamento.id}
    />
  );
}
