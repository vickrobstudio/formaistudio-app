import Stripe from 'stripe';

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = 'sandbox' | 'live';

export function getConnectionApiKey(env: StripeEnv): string {
  // Direct Stripe: test-mode secret key for sandbox, live secret key for live.
  return env === 'sandbox'
    ? getEnv('STRIPE_TEST_SECRET_KEY')
    : getEnv('STRIPE_SECRET_KEY');
}

export function createStripeClient(env: StripeEnv): Stripe {
  return new Stripe(getConnectionApiKey(env), {
    apiVersion: '2026-03-25.dahlia' as any,
  });
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; type?: string; code?: string; raw?: { message?: string; type?: string; code?: string } };
    const message = e.raw?.message ?? e.message;
    if (message) {
      const details = [e.raw?.type ?? e.type, e.raw?.code ?? e.code].filter(Boolean);
      return details.length ? `${message} (${details.join(', ')})` : message;
    }
  }
  return 'Stripe request failed';
}

export async function verifyWebhook(req: Request, env: StripeEnv): Promise<{ type: string; data: { object: any } }> {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  const secret = env === 'sandbox'
    ? getEnv('STRIPE_TEST_WEBHOOK_SECRET')
    : getEnv('STRIPE_WEBHOOK_SECRET');

  if (!signature || !body) throw new Error('Missing signature or body');

  const timestamps = signature.split(',').filter((part) => part.startsWith('t='));
  const timestamp = timestamps[0]?.slice(2);
  if (timestamps.length !== 1 || !timestamp || !/^\d+$/.test(timestamp) ||
      !Number.isSafeInteger(Number(timestamp)) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    throw new Error('Invalid webhook timestamp');
  }
  return Stripe.webhooks.constructEventAsync(body, signature, secret, 300);
}
