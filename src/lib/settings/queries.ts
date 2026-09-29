import { createClient } from "@/lib/supabase/server";
import type { TenantSettings } from "./types";

export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("fiscal_year_start_month")
    .eq("id", tenantId)
    .single();

  if (error) throw new Error(error.message);
  return { fiscalYearStartMonth: data.fiscal_year_start_month };
}
