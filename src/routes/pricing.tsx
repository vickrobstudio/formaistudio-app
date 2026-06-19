import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { useSubscription } from "@/hooks/use-subscription";
import { PLANS, type PlanId } from "@/lib/plans";
import { isNativeIOS, purchasePlan, restorePurchases } from "@/lib/iap";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — FormAI Studio" },
      { name: "description", content: "Subscribe to individual FormAI tools from $5/month, or unlock everything with Pro at $45/month." },
      { property: "og:title", content: "FormAI pricing — from $5/month" },
      { property: "og:description", content: "Per-tool subscriptions or the Pro bundle." },
      { rel: "canonical", href: "https://formaistudio.app/pricing" } as any,
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const navigate = useNavigate();
  const sub = useSubscription();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [iapBusy, setIapBusy] = useState<PlanId | null>(null);
  const [iapMsg, setIapMsg] = useState<string | null>(null);
  const onIOS = isNativeIOS();

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`
    : "";

  const handleSubscribe = async (planId: PlanId) => {
    if (signedIn === false) {
      void navigate({ to: "/auth", search: { redirect: "/pricing" } as any });
      return;
    }
    if (onIOS) {
      setIapBusy(planId);
      setIapMsg(null);
      const res = await purchasePlan(planId);
      setIapBusy(null);
      if (!res.ok && !("cancelled" in res && res.cancelled)) setIapMsg(res.error);
      return;
    }
    setSelected(planId);
  };

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <header className="mb-12 text-center">
          <Link to="/" aria-label="Back to FormAI home" className="mx-auto mb-8 inline-block">
            <img src="/app-icon.png" alt="FormAI" className="h-14 w-14 rounded-2xl" />
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
          <p className="mt-3 text-muted-foreground">Subscribe to a single tool, or unlock everything with Pro. Photo to AI is free.</p>
        </header>

        {selected ? (
          <div className="rounded-2xl border bg-card p-4">
            <button onClick={() => setSelected(null)} className="mb-4 text-sm text-muted-foreground hover:underline">
              ← Back to pricing
            </button>
            <StripeEmbeddedCheckout priceId={selected} returnUrl={returnUrl} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {PLANS.map((plan) => {
                const isPro = plan.id === "pro_monthly";
                const owned = sub.activePlans.has(plan.id);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => void handleSubscribe(plan.id)}
                    disabled={iapBusy === plan.id || owned}
                    className={`group relative flex aspect-square flex-col justify-between rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-90 ${isPro ? "ring-2 ring-black" : ""}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold leading-tight">{plan.name}</span>
                      {isPro && <span className="rounded-full bg-black px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Best</span>}
                    </span>
                    <span className="block">
                      <span className="block text-2xl font-semibold leading-none">${plan.priceUsd}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
                      <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{owned ? (sub.cancelAtPeriodEnd && sub.plan === plan.id ? "Ends soon" : "Subscribed") : iapBusy === plan.id ? "Opening…" : "Subscribe"}</span>
                    </span>
                  </button>
                );
              })}
              <Link to="/photo-to-ai" className="flex aspect-square flex-col justify-between rounded-2xl border border-dashed bg-muted/30 p-4 transition-colors hover:bg-accent">
                <span className="text-sm font-semibold leading-tight">Photo to AI</span>
                <span className="block">
                  <span className="block text-2xl font-semibold leading-none">Free</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Open</span>
                </span>
              </Link>
            </div>

            {onIOS && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => void restorePurchases()}
                  className="text-xs text-muted-foreground underline"
                >
                  Restore purchases
                </button>
                {iapMsg && <p className="mt-2 text-xs text-red-600">{iapMsg}</p>}
              </div>
            )}

            <p className="mt-10 text-center text-xs text-muted-foreground">
              Cancel anytime. Access continues until the end of your billing period.
            </p>

            {sub.isActive && (
              <p className="mt-4 text-center text-sm">
                Managing your subscriptions? <Link to="/settings" className="font-medium underline">Open settings</Link>
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}