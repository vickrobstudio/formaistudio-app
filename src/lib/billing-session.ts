import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

/** Purchases require the account identity; anonymous sign-ins remain disabled. */
export async function ensureBillingSession(): Promise<Session> {
  const { data } = await supabase.auth.getSession();
  if (data.session && !data.session.user.is_anonymous) return data.session;
  throw new Error("Sign in to connect this purchase or generation to your account and credits.");
}
