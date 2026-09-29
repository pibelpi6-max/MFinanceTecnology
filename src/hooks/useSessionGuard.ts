"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useSessionGuard() {
  useEffect(() => {
    const sessionOnly = sessionStorage.getItem("sf:session-only");
    if (!sessionOnly) return;

    function handleUnload() {
      const supabase = createClient();
      supabase.auth.signOut();
    }

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);
}
