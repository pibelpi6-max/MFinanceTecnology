import { createClient } from "@/lib/supabase/server";

export interface CurrentTenant {
  tenantId: string;
  tenantName: string;
  role: "admin" | "elaborador" | "aprovador" | "leitor";
  userId: string;
  userEmail: string | null;
}

export async function getCurrentTenant(): Promise<CurrentTenant | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_tenant_roles")
    .select("role, tenant_id, tenants(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[getCurrentTenant] erro ao buscar vínculo:", {
      userId: user.id,
      userEmail: user.email,
      error,
    });
  }

  if (!data) {
    console.warn("[getCurrentTenant] nenhum vínculo encontrado para:", {
      userId: user.id,
      userEmail: user.email,
    });
    return null;
  }

  const tenantName = Array.isArray(data.tenants)
    ? (data.tenants[0] as { name: string } | undefined)?.name
    : (data.tenants as unknown as { name: string } | null)?.name;

  return {
    tenantId: data.tenant_id,
    tenantName: tenantName ?? "",
    role: data.role,
    userId: user.id,
    userEmail: user.email ?? null,
  };
}
