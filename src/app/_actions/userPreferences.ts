"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveUserPreference(key: string, value: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      { user_id: user.id, key, value },
      { onConflict: "user_id,key" },
    );

  if (error) return { error: error.message };
  return { success: true as const };
}

export async function getUserPreference<T = unknown>(key: string): Promise<T | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_preferences")
    .select("value")
    .eq("user_id", user.id)
    .eq("key", key)
    .maybeSingle();

  return (data?.value as T) ?? null;
}