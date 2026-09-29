import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";

export const CUSTOMIZABLE_LABEL_KEYS = [
  "budgetPackage",
  "budgetPackagePlural",
] as const;
export type LabelKey = (typeof CUSTOMIZABLE_LABEL_KEYS)[number];

export async function getTenantLabels(
  tenantId: string,
  locale: string
): Promise<Record<LabelKey, string>> {
  const t = await getTranslations("labels");
  const labels = Object.fromEntries(
    CUSTOMIZABLE_LABEL_KEYS.map((key) => [key, t(key)])
  ) as Record<LabelKey, string>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_labels")
    .select("label_key, values")
    .eq("tenant_id", tenantId)
    .in("label_key", CUSTOMIZABLE_LABEL_KEYS as unknown as string[]);

  for (const row of data ?? []) {
    const key = row.label_key as LabelKey;
    const value = (row.values as Record<string, string> | null)?.[locale];
    if (value) labels[key] = value;
  }
  return labels;
}
