import { isFormAIOwner } from "@/lib/owner-access";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCreditAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { readBillingState } = await import("./generation-billing.server");
    const state = await readBillingState(getRequest());
    return { credits: state.paid + state.trial, owner: state.owner, activePlans: state.activePlans as string[], expiresAt: state.expiresAt as string | null };
  });

// Compatibility preflight only. The provider boundary owns the actual debit.
export const consumeAccountCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { readBillingState } = await import("./generation-billing.server");
    const state = await readBillingState(getRequest());
    if (!state.owner && state.paid + state.trial < 1) throw new Error("No credits available.");
    return { remaining: state.paid + state.trial };
  });

export const activateVerifiedVipAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error: userError } = await context.supabase.auth.getUser();
    if (userError || !isFormAIOwner(data.user)) return { activated: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ has_free_access: true, updated_at: new Date().toISOString() }).eq("id", context.userId);
    if (error) throw new Error("Unable to activate access");
    return { activated: true };
  });
