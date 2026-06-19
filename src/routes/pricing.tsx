import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { useSubscription } from "@/hooks/use-subscription";
import { PLANS, type PlanId } from "@/lib/plans";

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

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`
    : "";

  const handleSubscribe = (planId: PlanId) => {
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
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {PLANS.map((plan) => {
                const isPro = plan.id === "pro_monthly";
                const owned = sub.activePlans.has(plan.id);
                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${isPro ? "ring-2 ring-black" : ""}`}
                  >
                    {isPro && (
                      <span className="mb-3 inline-block w-fit rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                        Best value
                      </span>
                    )}
                    <h2 className="text-xl font-semibold">{plan.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>
                    <div className="mt-5 flex items-baseline gap-1">
                      <span className="text-3xl font-semibold">${plan.priceUsd}</span>
                      <span className="text-sm text-muted-foreground">/month</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{plan.credits.toLocaleString()} credits / month</div>

                    <div className="mt-6 flex-1" />

                    {owned ? (
                      <div className="rounded-xl bg-muted px-3 py-2 text-center text-xs">
                        Subscribed{sub.cancelAtPeriodEnd && sub.plan === plan.id ? " (ends at period end)" : ""}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(plan.id)}
                        className={`w-full rounded-full px-5 py-3 text-sm font-medium transition ${
                          isPro ? "bg-black text-white hover:bg-black/85" : "border border-black/15 hover:bg-muted"
                        }`}
                      >
                        Subscribe — ${plan.priceUsd}/mo
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-col rounded-2xl border border-dashed bg-muted/30 p-6">
                <h2 className="text-xl font-semibold">Photo to AI</h2>
                <p className="mt-1 text-sm text-muted-foreground">Free forever. Convert photos into AI-styled images.</p>
                <div className="mt-5 text-3xl font-semibold">Free</div>
                <div className="mt-1 text-xs text-muted-foreground">No subscription needed</div>
                <div className="mt-6 flex-1" />
                <Link
                  to="/photo-to-ai"
                  className="w-full rounded-full border border-black/15 px-5 py-3 text-center text-sm font-medium hover:bg-background"
                >
                  Open Photo to AI
                </Link>
              </div>
            </div>

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