import process from "node:process";
import crypto from "node:crypto";

// Server-only. Lets a member connect their own Instagram Business/Creator
// account (via Facebook Login for Business) so their creations can be
// posted straight to their account, in addition to the studio's own
// @formaistudio.app cross-post in instagram-publish.server.ts.
//
// Requires INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and
// INSTAGRAM_OAUTH_STATE_SECRET in the environment. The Meta app must also
// have this callback URL registered as a Valid OAuth Redirect URI — see
// REDIRECT_URI below.
const GRAPH_VERSION = "v21.0";
// www is the canonical production host — formaistudio.app (apex) 308s to it,
// and Meta requires an exact redirect_uri match (no redirect hops).
const SITE_ORIGIN = "https://www.formaistudio.app";
export const INSTAGRAM_CALLBACK_PATH = "/api/public/instagram/callback";
const REDIRECT_URI = `${SITE_ORIGIN}${INSTAGRAM_CALLBACK_PATH}`;
const SCOPES = ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "business_management"];
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/** Signs `${userId}.${timestamp}.${nonce}` so the callback (which gets no auth header) can trust the state Meta echoes back. */
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
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

type ConnectedAccount = { pageId: string; pageAccessToken: string; igUserId: string; igUsername: string };

class InstagramConnectError extends Error {}

async function exchangeCodeForUserToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: requireEnv("INSTAGRAM_APP_ID"),
    client_secret: requireEnv("INSTAGRAM_APP_SECRET"),
    redirect_uri: REDIRECT_URI,
    code,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params.toString()}`);
  const body = await res.json().catch(() => null) as { access_token?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.access_token) throw new InstagramConnectError(body?.error?.message ?? "Instagram sign-in failed.");
  return body.access_token;
}

async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: requireEnv("INSTAGRAM_APP_ID"),
    client_secret: requireEnv("INSTAGRAM_APP_SECRET"),
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params.toString()}`);
  const body = await res.json().catch(() => null) as { access_token?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.access_token) throw new InstagramConnectError(body?.error?.message ?? "Could not extend the Instagram session.");
  return body.access_token;
}

async function findConnectedInstagramAccount(longLivedUserToken: string): Promise<ConnectedAccount> {
  const params = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username}",
    access_token: longLivedUserToken,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?${params.toString()}`);
  const body = await res.json().catch(() => null) as { data?: Array<{ id: string; access_token: string; instagram_business_account?: { id: string; username: string } }>; error?: { message?: string } } | null;
  if (!res.ok || !body) throw new InstagramConnectError(body?.error?.message ?? "Could not read your Facebook Pages.");
  const page = body.data?.find((candidate) => candidate.instagram_business_account);
  if (!page?.instagram_business_account) {
    throw new InstagramConnectError("No Instagram Business or Creator account was found. Connect your Instagram account to a Facebook Page first, then try again.");
  }
  return { pageId: page.id, pageAccessToken: page.access_token, igUserId: page.instagram_business_account.id, igUsername: page.instagram_business_account.username };
}

/** Runs the full code -> connected IG Business account exchange for the OAuth callback route. */
export async function completeInstagramConnection(code: string): Promise<ConnectedAccount> {
  const shortLivedToken = await exchangeCodeForUserToken(code);
  const longLivedToken = await exchangeForLongLivedToken(shortLivedToken);
  return findConnectedInstagramAccount(longLivedToken);
}

export { InstagramConnectError };
