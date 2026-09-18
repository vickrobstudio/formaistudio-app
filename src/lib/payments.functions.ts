import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { getRequest } from "@tanstack/react-start/server";
import { PLANS } from "@/lib/plans";

function checkoutContext(environment: StripeEnv, returnUrl?: string) {
  const expected: StripeEnv = process.env.VERCEL_ENV === "production" ? "live" : "sandbox";
  if (environment !== expected) throw new Error("Payment environment does not match this site.");
  const origin = process.env.VERCEL_ENV === "production" ? "https://www.formaistudio.app" : new URL(getRequest().url).origin;
  if (returnUrl && new URL(returnUrl).origin !== origin) throw new Error("Invalid payment return address.");
  return origin;
}

type CheckoutSessionResult = { clientSecret: string } | { error: string };
type PortalSessionResult = { url: string } | { error: string };

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    const customer = existing.data.find(item => !item.metadata?.userId || item.metadata.userId === options.userId);
    if (customer) {
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { priceId: string; returnUrl: string; environment: StripeEnv }) => {
    if (!PLANS.some(plan => plan.id === data.priceId)) throw new Error("Invalid plan");
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    try {
      checkoutContext(data.environment, data.returnUrl);
      const { supabase, userId } = context;
      const { data: { user } } = await supabase.auth.getUser();
      const stripe = createStripeClient(data.environment);

      if (!user?.email_confirmed_at || user.is_anonymous) throw new Error("Verify your email before subscribing.");
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId], active: true });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const isRecurring = stripePrice.type === "recurring";
      if (!isRecurring || stripePrice.recurring?.interval !== "month") throw new Error("Monthly subscription price is not configured.");

      const customerId = await resolveOrCreateCustomer(stripe, {
        email: user?.email ?? undefined,
        userId,
      });

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        metadata: { userId },
        ...(isRecurring && { subscription_data: { metadata: { userId } } }),
      } as any);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { returnUrl?: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<PortalSessionResult> => {
    checkoutContext(data.environment, data.returnUrl);
    const { supabase, userId } = context;
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError || !sub?.stripe_customer_id) throw new Error("No subscription found");

    try {
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id as string,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

