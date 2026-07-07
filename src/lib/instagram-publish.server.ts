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

async function publishToInstagramAccount(businessAccountId: string, accessToken: string, publicImageUrl: string, caption: string): Promise<void> {
  const createRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${businessAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: publicImageUrl, caption: caption.slice(0, 2200), access_token: accessToken }),
  });
  const created = await createRes.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!createRes.ok || !created?.id) throw new Error(created?.error?.message ?? "Instagram rejected the image.");

  const publishRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${businessAccountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: created.id, access_token: accessToken }),
  });
  if (!publishRes.ok) {
    const failed = await publishRes.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(failed?.error?.message ?? "Instagram could not publish the post.");
  }
}

// Configure INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN (a
// long-lived Page access token with the instagram_content_publish
// permission) in Vercel — until both are set this silently no-ops.
export async function postToStudioInstagram(supabase: SupabaseClient<Database>, userId: string, imageUrl: string, caption: string): Promise<void> {
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!businessAccountId || !accessToken) return;
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
