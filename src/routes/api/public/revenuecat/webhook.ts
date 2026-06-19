import { createFileRoute } from "@tanstack/react-router";

/**
 * RevenueCat webhook — receives iOS in-app purchase events and syncs them
 * into the `iap_entitlements` table.
 *
 * Configure in RevenueCat Dashboard → Project Settings → Integrations → Webhooks:
 *   URL:    https://www.formaistudio.app/api/public/revenuecat/webhook
 *   Header: Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH>
 */

type RCEvent = {
  type: string;
  app_user_id: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  expiration_at_ms?: number | null;
};

async function handle(event: RCEvent) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const userId = event.app_user_id;
  if (!userId || userId.startsWith("$RCAnonymousID")) return;

  const entitlementIds = event.entitlement_ids
    ?? (event.entitlement_id ? [event.entitlement_id] : []);
  if (!entitlementIds.length) return;

  const isActiveEvent = ![
    "CANCELLATION",
    "EXPIRATION",
    "SUBSCRIPTION_PAUSED",
    "REFUND",
  ].includes(event.type);

  const expiresAt = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  for (const entitlementId of entitlementIds) {
    await supabaseAdmin.from("iap_entitlements").upsert(
      {
        user_id: userId,
        entitlement_id: entitlementId,
        product_id: event.product_id ?? entitlementId,
        expires_at: expiresAt,
        is_active: isActiveEvent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,entitlement_id" },
    );
  }
}

export const Route = createFileRoute("/api/public/revenuecat/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
        if (!expected) return new Response("Webhook auth not configured", { status: 500 });
        const auth = request.headers.get("authorization");
        if (auth !== `Bearer ${expected}`) return new Response("Unauthorized", { status: 401 });

        try {
          const body = await request.json() as { event: RCEvent };
          if (body?.event) await handle(body.event);
          return Response.json({ received: true });
        } catch (e) {
          console.error("RevenueCat webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});