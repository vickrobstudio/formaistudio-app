import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { useSubscription } from "@/hooks/use-subscription";

const FEATURES = [
  "Unlimited 8K AI rendering",
  "Floor plan to 3D",
  "2D to 3D conversion",
  "Photo to AI",
  "Furniture design & 3D preview",
  "Video generation",
  "Priority generation queue",
  "2,000 credits refilled monthly",
];

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — FormAI Studio" },
      { name: "description", content: "FormAI Pro — all tools, 8K renders, 2D-to-3D, AI interior rendering, and more for $45/month." },
      { property: "og:title", content: "FormAI Pro — $45/month" },
      { property: "og:description", content: "All AI rendering and 3D tools, unlocked." },
      { rel: "canonical", href: "https://formaistudio.app/pricing" } as any,
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const navigate = useNavigate();
  const sub = useSubscription();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`
    : "";

  const handleSubscribe = () => {
    if (signedIn === false) {
      void navigate({ to: "/auth", search: { redirect: "/pricing" } as any });
      return;
    }
    setCheckoutOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Simple pricing</h1>
          <p className="mt-3 text-muted-foreground">All FormAI tools, one plan.</p>
        </header>

        {checkoutOpen ? (
          <div className="rounded-2xl border bg-card p-4">
            <button onClick={() => setCheckoutOpen(false)} className="mb-4 text-sm text-muted-foreground hover:underline">
              ← Back to pricing
            </button>
            <StripeEmbeddedCheckout priceId="pro_monthly" returnUrl={returnUrl} />
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-8 shadow-sm">
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className="text-2xl font-semibold">FormAI Pro</h2>
                <p className="mt-1 text-sm text-muted-foreground">Everything you need to design with AI.</p>
              </div>
              <div className="text-right">
                <div className="text-4xl font-semibold">$45</div>
                <div className="text-sm text-muted-foreground">per month</div>
              </div>
            </div>

            <ul className="mt-8 space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 text-emerald-600">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10">
              {sub.isActive ? (
                <div className="rounded-xl bg-muted px-4 py-3 text-center text-sm">
                  You're subscribed{sub.cancelAtPeriodEnd ? " (canceled — access until period end)" : ""}.{" "}
                  <Link to="/settings" className="font-medium underline">Manage</Link>
                </div>
              ) : (
                <button
                  onClick={handleSubscribe}
                  className="w-full rounded-full bg-black px-6 py-4 text-base font-medium text-white transition hover:bg-black/85"
                >
                  Subscribe — $45/month
                </button>
              )}
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Cancel anytime. Access continues until the end of your billing period.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}