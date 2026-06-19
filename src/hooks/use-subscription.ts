import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

export interface SubscriptionState {
  loading: boolean;
  isActive: boolean;
  status: string | null;
  plan: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
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
  const [state, setState] = useState<SubscriptionState>({
    loading: true,
    isActive: false,
    status: null,
    plan: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });

  useEffect(() => {
    let cancelled = false;
    let env: ReturnType<typeof getStripeEnvironment> | null = null;
    try { env = getStripeEnvironment(); } catch { env = null; }

    async function refetch(userId: string) {
      if (!env) return;
      const { data } = await supabase
        .from("subscriptions")
        .select("status, price_id, current_period_end, cancel_at_period_end")
        .eq("user_id", userId)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setState({ loading: false, isActive: false, status: null, plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });
        return;
      }
      setState({
        loading: false,
        isActive: computeActive(data),
        status: data.status,
        plan: data.price_id,
        currentPeriodEnd: data.current_period_end,
        cancelAtPeriodEnd: !!data.cancel_at_period_end,
      });
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState((s) => ({ ...s, loading: false })); return; }
      await refetch(user.id);

      const channel = supabase
        .channel(`subs-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` }, () => { void refetch(user.id); })
        .subscribe();

      return () => { void supabase.removeChannel(channel); };
    })();

    return () => { cancelled = true; };
  }, []);

  return state;
}