import { isFormAIOwner } from "@/lib/owner-access";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toolUnlockedBy } from "@/lib/plans";

export interface SubscriptionState {
  loading: boolean;
  isActive: boolean;
  status: string | null;
  plan: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  activePlans: Set<string>;
  hasTool: (toolPath: string) => boolean;
}

function computeActive(row: { status: string; current_period_end: string | null }) {
  const now = Date.now();
  const end = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
  if (["active", "trialing", "past_due"].includes(row.status)) {
    return end === null || end > now;
  }
  if (row.status === "canceled") return end !== null && end > now;
  return false;
}

export function useSubscription() {
  const [owner, setOwner] = useState(false);
  const [rows, setRows] = useState<Array<{ status: string; price_id: string; current_period_end: string | null; cancel_at_period_end: boolean | null }>>([]);
  const [iapRows, setIapRows] = useState<Array<{ entitlement_id: string; expires_at: string | null; is_active: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let env: ReturnType<typeof getStripeEnvironment> | null = null;
    try { env = getStripeEnvironment(); } catch { env = null; }

    async function refetch(userId: string) {
      const subsPromise = env
        ? supabase
            .from("subscriptions")
            .select("status, price_id, current_period_end, cancel_at_period_end")
            .eq("user_id", userId)
            .eq("environment", env)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] });
      const iapPromise = supabase
        .from("iap_entitlements")
        .select("entitlement_id, expires_at, is_active")
        .eq("user_id", userId);
      const [subs, iap] = await Promise.all([subsPromise, iapPromise]);
      if (cancelled) return;
      setRows((subs as any).data ?? []);
      setIapRows(((iap as any).data ?? []) as any);
      setLoading(false);
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setOwner(isFormAIOwner(user));
      await refetch(user.id);

      const channel = supabase
        .channel(`subs-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` }, () => { void refetch(user.id); })
        .subscribe();

      return () => { void supabase.removeChannel(channel); };
    })();

    return () => { cancelled = true; };
  }, []);

  return useMemo<SubscriptionState>(() => {
    const activePlans = new Set<string>();
    let primary: typeof rows[number] | null = null;
    for (const r of rows) {
      if (computeActive(r)) {
        activePlans.add(r.price_id);
        if (!primary) primary = r;
      }
    }
    const now = Date.now();
    for (const e of iapRows) {
      const exp = e.expires_at ? new Date(e.expires_at).getTime() : null;
      if (e.is_active && (exp === null || exp > now)) activePlans.add(e.entitlement_id);
    }
    return {
      loading,
      isActive: owner || activePlans.size > 0,
      status: primary?.status ?? null,
      plan: primary?.price_id ?? null,
      currentPeriodEnd: primary?.current_period_end ?? null,
      cancelAtPeriodEnd: !!primary?.cancel_at_period_end,
      activePlans,
      hasTool: (toolPath: string) => owner || toolUnlockedBy(activePlans, toolPath),
    };
  }, [rows, iapRows, loading, owner]);
}