import process from "node:process";
import crypto from "node:crypto";

// Server-only. Lets a member connect their own Instagram Business/Creator
// account (via Instagram Business Login — the newer "Instagram API with
// Instagram Login" product, NO Facebook Page required) so their creations
// can be posted straight to their account, in addition to the studio's own
// @formaistudio.app cross-post in instagram-publish.server.ts.
//
// Requires INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET (the Instagram-product
// credentials from the app dashboard's "API setup with Instagram business
// login" section — NOT the parent Meta app pair) and
// INSTAGRAM_OAUTH_STATE_SECRET in the environment. The dashboard must list
// REDIRECT_URI below under Business login settings → OAuth redirect URIs.
//
// Instagram redirects straight back to the Account page (a normal client
// route, not a server API route) with ?code=&state= — the Account page
// then calls the authenticated completeInstagramConnect server function,
// which writes instagram_connections using the member's own Supabase JWT
// (RLS), not the service-role key. This deliberately avoids ever needing
// SUPABASE_SERVICE_ROLE_KEY for the connect flow.
const GRAPH_VERSION = "v21.0";
// www is the canonical production host — formaistudio.app (apex) 308s to it,
// and Meta requires an exact redirect_uri match (no redirect hops).
const SITE_ORIGIN = "https://www.formaistudio.app";
export const INSTAGRAM_REDIRECT_PATH = "/account";
const REDIRECT_URI = `${SITE_ORIGIN}${INSTAGRAM_REDIRECT_PATH}`;
// Business-login scope names (the classic instagram_basic/… names belong to
// the old Facebook-Login flavour and are rejected by this dialog).
const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/** Signs `${userId}.${timestamp}.${nonce}` so the callback (which gets no auth header) can trust the state Instagram echoes back. */
export function signInstagramOAuthState(userId: string): string {
  const secret = requireEnv("INSTAGRAM_OAUTH_STATE_SECRET");
  const payload = `${userId}.${Date.now()}.${crypto.randomBytes(8).toString("hex")}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyInstagramOAuthState(state: string): { userId: string } | null {
  const secret = requireEnv("INSTAGRAM_OAUTH_STATE_SECRET");
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [userId, timestamp, nonce, signature] = parts;
  const payload = `${userId}.${timestamp}.${nonce}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) return null;
  if (Date.now() - Number(timestamp) > STATE_MAX_AGE_MS) return null;
  return { userId };
}

export function buildInstagramAuthorizeUrl(userId: string): string {
  const clientId = requireEnv("INSTAGRAM_APP_ID");
  const state = signInstagramOAuthState(userId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    state,
    response_type: "code",
    scope: SCOPES.join(","),
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

// pageId is vestigial under Business Login (no Facebook Page involved) but
// kept so instagram_connections rows stay shape-compatible.
type ConnectedAccount = { pageId: string; pageAccessToken: string; igUserId: string; igUsername: string };

class InstagramConnectError extends Error {}

async function exchangeCodeForShortLivedToken(code: string): Promise<string> {
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("INSTAGRAM_APP_ID"),
      client_secret: requireEnv("INSTAGRAM_APP_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });
  const body = await res.json().catch(() => null) as { access_token?: string; data?: Array<{ access_token?: string }>; error_message?: string; error?: { message?: string } } | null;
  const token = body?.access_token ?? body?.data?.[0]?.access_token;
  if (!res.ok || !token) throw new InstagramConnectError(body?.error_message ?? body?.error?.message ?? "Instagram sign-in failed.");
  return token;
}

async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: requireEnv("INSTAGRAM_APP_SECRET"),
    access_token: shortLivedToken,
  });
  const res = await fetch(`https://graph.instagram.com/access_token?${params.toString()}`);
  const body = await res.json().catch(() => null) as { access_token?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.access_token) throw new InstagramConnectError(body?.error?.message ?? "Could not extend the Instagram session.");
  return body.access_token;
}

async function fetchInstagramProfile(longLivedToken: string): Promise<{ id: string; username: string }> {
  const params = new URLSearchParams({ fields: "id,username", access_token: longLivedToken });
  const res = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me?${params.toString()}`);
  const body = await res.json().catch(() => null) as { id?: string; username?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.id || !body.username) throw new InstagramConnectError(body?.error?.message ?? "Could not read your Instagram profile.");
  return { id: body.id, username: body.username };
}

/** Runs the full code -> connected IG Business account exchange for completeInstagramConnect. */
export async function completeInstagramConnection(code: string): Promise<ConnectedAccount> {
  const shortLivedToken = await exchangeCodeForShortLivedToken(code);
  const longLivedToken = await exchangeForLongLivedToken(shortLivedToken);
  const profile = await fetchInstagramProfile(longLivedToken);
  return { pageId: "", pageAccessToken: longLivedToken, igUserId: profile.id, igUsername: profile.username };
}

export { InstagramConnectError };
