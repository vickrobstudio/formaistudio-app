import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const consumeAccountCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("consume_starter_credit_for_user", { _user_id: context.userId });
    if (error || data === null) throw new Error("Unable to apply credit");
    return { remaining: data };
  });

export const activateVerifiedVipAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = String(context.claims.email ?? "").trim().toLowerCase();
    if (email !== "hello@vickrob.com") return { activated: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ has_free_access: true, updated_at: new Date().toISOString() }).eq("id", context.userId);
    if (error) throw new Error("Unable to activate access");
    return { activated: true };
  });