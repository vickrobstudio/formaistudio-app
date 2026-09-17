import { ensureBillingSession } from "./billing-session";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

export async function aiRequestHeaders(): Promise<Record<string,string>> {
  const session = await ensureBillingSession();
  return {
    Authorization: `Bearer ${session.access_token}`,
    "x-formai-operation-id": crypto.randomUUID(),
    "x-formai-client": Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios" ? "ios" : "web",
    ...(localStorage.getItem("formai-ai-consent-openai-v2") === "1" ? { "x-formai-ai-consent": "openai-v2" } : {}),
  };
}
