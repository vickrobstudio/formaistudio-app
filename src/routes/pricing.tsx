import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { useSubscription } from "@/hooks/use-subscription";
import { PLANS, type PlanId } from "@/lib/plans";
import { getIapPriceStrings, isNativeIOS, purchasePlan, restorePurchases } from "@/lib/iap";
import type { Plan } from "@/lib/plans";

const TOOL_NAMES: Record<string, string> = {
  "/2d-to-3d": "2D to 3D",
  "/studio": "Studio AI",
  "/model-to-ai": "3D to AI",
  "/ai-edits": "AI Edits",
  "/photo-to-ai": "Photo to AI",
  "/ai-to-video": "AI to Video",
};

// A clear, Apple-required description of exactly what each subscription unlocks.
function describePlan(plan: Plan): string {
  const paidTools = plan.tools.filter((t) => t !== "/photo-to-ai").map((t) => TOOL_NAMES[t] ?? t);
  const unlocks = plan.id === "pro_monthly" ? "Unlocks every tool" : `Unlocks ${paidTools.join(", ")}`;
  return `${unlocks} · ${plan.credits.toLocaleString()} AI credits every month`;
}

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
  const [iapPrices, setIapPrices] = useState<Partial<Record<PlanId, string>>>({});
  const onIOS = isNativeIOS();

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    // Preload RevenueCat on iOS so StoreKit products/offerings are ready
    // before the first tap, and show Apple's real localized prices (which
    // must match the products) instead of our hardcoded USD numbers.
    if (onIOS) void getIapPriceStrings().then(setIapPrices).catch(() => {});
  }, [onIOS]);

  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`
    : "";

  const handleSubscribe = async (planId: PlanId) => {
    // iOS In-App Purchase works WITHOUT an account (Apple 5.1.1) — never send
    // a guest to sign up first. Purchase runs against RevenueCat (anonymous
    // if not signed in); the device then unlocks locally.
    if (onIOS) {
      setIapBusy(planId);
      setIapMsg(null);
      const res = await purchasePlan(planId);
      setIapBusy(null);
      if (res.ok) {
        // Reopen the tools with a fresh session so the unlocked state is picked up.
        setIapMsg("Subscription active — unlocking your tools…");
        setTimeout(() => { window.location.assign("/tools"); }, 3000);
      } else if (!("cancelled" in res && res.cancelled)) {
        setIapMsg(res.error);
      }
      return;
    }
    // Web only: Stripe checkout needs an account.
    if (signedIn === false) {
      void navigate({ to: "/auth", search: { redirect: "/pricing" } as any });
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

        {selected && !onIOS ? (
          <div className="rounded-2xl border bg-card p-4">
            <button onClick={() => setSelected(null)} className="mb-4 text-sm text-muted-foreground hover:underline">
              ← Back to pricing
            </button>
            <StripeEmbeddedCheckout priceId={selected} returnUrl={returnUrl} />
          </div>
        ) : (
          <>
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2">
              {PLANS.map((plan) => {
                const isPro = plan.id === "pro_monthly";
                const owned = sub.activePlans.has(plan.id);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => void handleSubscribe(plan.id)}
                    disabled={iapBusy === plan.id || owned}
                    className={`group relative flex aspect-square flex-col justify-between rounded-3xl border bg-card p-7 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-90 ${isPro ? "ring-2 ring-black" : ""}`}
                  >
                    <span className="block space-y-2">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-lg font-semibold leading-tight">{plan.name}</span>
                        {isPro && <span className="rounded-full bg-black px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Best</span>}
                      </span>
                      <span className="block text-sm font-medium leading-snug">{plan.blurb}</span>
                      <span className="block text-xs leading-snug text-muted-foreground">{describePlan(plan)}</span>
                    </span>
                    <span className="block">
                      <span className="block text-5xl font-semibold leading-none">{onIOS && iapPrices[plan.id] ? iapPrices[plan.id] : `$${plan.priceUsd}`}<span className="text-base font-normal text-muted-foreground">/mo · auto-renews monthly</span></span>
                      <span className="mt-3 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{owned ? (sub.cancelAtPeriodEnd && sub.plan === plan.id ? "Ends soon" : "Subscribed") : iapBusy === plan.id ? "Opening…" : signedIn === false && !onIOS ? "Sign in to subscribe" : "Subscribe"}</span>
                    </span>
                  </button>
                );
              })}
              <Link to="/photo-to-ai" className="flex aspect-square flex-col justify-between rounded-3xl border border-dashed bg-muted/30 p-7 transition-colors hover:bg-accent">
                <span className="text-lg font-semibold leading-tight">Photo to AI</span>
                <span className="block">
                  <span className="block text-5xl font-semibold leading-none">Free</span>
                  <span className="mt-3 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Open</span>
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

            <div className="mt-10 space-y-2 text-center text-xs text-muted-foreground">
              <p>
                All plans are auto-renewable monthly subscriptions ($5–$45 per month, billed to your Apple ID).
                Your subscription renews automatically at the price shown unless you turn off auto-renew at least
                24 hours before the end of the current period. Manage or cancel anytime in your Apple ID settings.
              </p>
              <p className="flex items-center justify-center gap-3">
                <Link to="/terms" className="font-medium underline">Terms of Use (EULA)</Link>
                <span aria-hidden="true">·</span>
                <Link to="/privacy" className="font-medium underline">Privacy Policy</Link>
              </p>
              {onIOS && signedIn === false && (
                <p>No account required. Optionally <Link to="/auth" className="font-medium underline">create a free account</Link> to use your subscription on your other devices.</p>
              )}
            </div>

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