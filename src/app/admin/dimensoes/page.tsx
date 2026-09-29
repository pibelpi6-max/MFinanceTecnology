import { redirect, notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getDimensionTypes } from "@/lib/dimensions/queries";

export default async function DimensoesIndexPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const types = await getDimensionTypes(tenant.tenantId);
  if (types.length === 0) notFound();

  redirect(`/admin/dimensoes/${types[0].code}`);
}
