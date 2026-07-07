import process from "node:process";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Server-only. Posts to Instagram via the Instagram Graph API, either to
// the studio's own account (@formaistudio.app) or to a member's connected
// account (see instagram-connect.functions.ts). publishToInstagramAccount
// throws on any failure; callers choose whether that should surface to the
// user (shareToMyInstagram) or be swallowed as best-effort (the automatic
// cross-post from community publishing).
//
// Every function here takes the caller's own RLS-scoped Supabase client
// (from requireSupabaseAuth) rather than the service-role client — image
// uploads land under `${userId}/instagram-posts/...`, which the existing
// user-outputs storage policies already allow the owner to write and read.
// This keeps the whole Instagram feature working without ever needing
// SUPABASE_SERVICE_ROLE_KEY.
const GRAPH_VERSION = "v21.0";

// Two flavours of Instagram publishing tokens exist:
//  - "IGAA…" tokens come from the newer "Instagram API with Instagram Login"
//    (no Facebook Page involved) and must call graph.instagram.com.
//  - "EAA…" Page access tokens come from the classic Facebook-Login flow
//    (member-connected accounts) and must call graph.facebook.com.
// The endpoints and payloads are identical; only the host differs.
function graphHost(accessToken: string): string {
  return accessToken.startsWith("IG") ? "graph.instagram.com" : "graph.facebook.com";
}

async function resolvePublicImageUrl(supabase: SupabaseClient<Database>, userId: string, imageUrl: string): Promise<string> {
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  const match = /^data:([^;]+);base64,(.+)$/.exec(imageUrl);
  if (!match) throw new Error("Unrecognized image format.");
  const [, contentType, base64] = match;
  const path = `${userId}/instagram-posts/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await supabase.storage.from("user-outputs").upload(path, Buffer.from(base64, "base64"), { contentType });
  if (error) throw new Error("Could not prepare the image for Instagram.");
  // Instagram fetches the image once while creating the media container —
  // a short-lived signed URL is plenty and avoids exposing it any longer.
  const { data: signed } = await supabase.storage.from("user-outputs").createSignedUrl(path, 900);
  if (!signed?.signedUrl) throw new Error("Could not prepare the image for Instagram.");
  return signed.signedUrl;
}

// Container creation is asynchronous on Instagram's side: after POST /media
// the container needs a few seconds to download + process the image, and
// calling media_publish before it reaches FINISHED fails with "Media ID is
// not available". Poll the container status until it's ready.
async function waitForContainerReady(host: string, containerId: string, accessToken: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`https://${host}/${GRAPH_VERSION}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`);
    const body = await res.json().catch(() => null) as { status_code?: string; error?: { message?: string } } | null;
    const status = body?.status_code;
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") throw new Error("Instagram could not process the image. Please try again.");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Instagram is taking too long to process the image. Please try again.");
}

async function publishToInstagramAccount(businessAccountId: string, accessToken: string, publicImageUrl: string, caption: string): Promise<void> {
  const host = graphHost(accessToken);
  const createRes = await fetch(`https://${host}/${GRAPH_VERSION}/${businessAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: publicImageUrl, caption: caption.slice(0, 2200), access_token: accessToken }),
  });
  const created = await createRes.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!createRes.ok || !created?.id) throw new Error(created?.error?.message ?? "Instagram rejected the image.");

  await waitForContainerReady(host, created.id, accessToken);

  // Even after FINISHED, publish can transiently report the media as not yet
  // available — retry a couple of times before giving up.
  let lastError = "Instagram could not publish the post.";
  for (let attempt = 0; attempt < 3; attempt++) {
    const publishRes = await fetch(`https://${host}/${GRAPH_VERSION}/${businessAccountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: created.id, access_token: accessToken }),
    });
    if (publishRes.ok) return;
    const failed = await publishRes.json().catch(() => null) as { error?: { message?: string } } | null;
    lastError = failed?.error?.message ?? lastError;
    if (!/not available|not ready|try again/i.test(lastError)) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(lastError);
}

// Configure INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN in
// Vercel — until both are set this silently no-ops. The token is a
// long-lived (~60 days, refresh via ig_refresh_token) "IGAA…" token from
// the Instagram-Login API with instagram_business_content_publish.
export async function postToStudioInstagram(supabase: SupabaseClient<Database>, userId: string, imageUrl: string, caption: string): Promise<void> {
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!businessAccountId || !accessToken) return;
  const publicImageUrl = await resolvePublicImageUrl(supabase, userId, imageUrl);
  await publishToInstagramAccount(businessAccountId, accessToken, publicImageUrl, caption);
}

// Same as postToStudioInstagram, but throws so the manual "Post to
// @formaistudio.app" button can show members a real success/error result.
export async function postToStudioInstagramOrThrow(supabase: SupabaseClient<Database>, userId: string, imageUrl: string, caption: string): Promise<void> {
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!businessAccountId || !accessToken) throw new Error("Instagram posting is not configured yet.");
  const publicImageUrl = await resolvePublicImageUrl(supabase, userId, imageUrl);
  await publishToInstagramAccount(businessAccountId, accessToken, publicImageUrl, caption);
}

// Posts to a member's own connected Instagram Business/Creator account.
// No-ops silently if the member never connected Instagram (see
// instagram_connections in instagram-connect.functions.ts). This is the
// best-effort path used by the automatic community-publish cross-post.
export async function postToUserInstagram(supabase: SupabaseClient<Database>, userId: string, imageUrl: string, caption: string): Promise<void> {
  const { data: connection } = await supabase.from("instagram_connections").select("ig_user_id,access_token").eq("user_id", userId).maybeSingle();
  if (!connection) return;
  const publicImageUrl = await resolvePublicImageUrl(supabase, userId, imageUrl);
  await publishToInstagramAccount(connection.ig_user_id, connection.access_token, publicImageUrl, caption);
}

// Same as postToUserInstagram, but throws so the caller (the manual "Share
// to Instagram" button) can show the member a real success/error result.
export async function postToConnectedInstagramOrThrow(supabase: SupabaseClient<Database>, userId: string, imageUrl: string, caption: string): Promise<void> {
  const { data: connection } = await supabase.from("instagram_connections").select("ig_user_id,access_token").eq("user_id", userId).maybeSingle();
  if (!connection) throw new Error("Connect Instagram in Settings first.");
  const publicImageUrl = await resolvePublicImageUrl(supabase, userId, imageUrl);
  await publishToInstagramAccount(connection.ig_user_id, connection.access_token, publicImageUrl, caption);
}
