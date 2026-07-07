import process from "node:process";

// Server-only. Posts to Instagram via the Instagram Graph API, either to
// the studio's own account (@formaistudio.app) or to a member's connected
// account (see instagram-connect.functions.ts). publishToInstagramAccount
// throws on any failure; callers choose whether that should surface to the
// user (shareToMyInstagram) or be swallowed as best-effort (the automatic
// cross-post from community publishing).
const GRAPH_VERSION = "v21.0";

async function resolvePublicImageUrl(imageUrl: string): Promise<string> {
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  const match = /^data:([^;]+);base64,(.+)$/.exec(imageUrl);
  if (!match) throw new Error("Unrecognized image format.");
  const [, contentType, base64] = match;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = `instagram-posts/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await supabaseAdmin.storage.from("user-outputs").upload(path, Buffer.from(base64, "base64"), { contentType });
  if (error) throw new Error("Could not prepare the image for Instagram.");
  // Instagram fetches the image once while creating the media container —
  // a short-lived signed URL is plenty and avoids exposing it any longer.
  const { data: signed } = await supabaseAdmin.storage.from("user-outputs").createSignedUrl(path, 900);
  if (!signed?.signedUrl) throw new Error("Could not prepare the image for Instagram.");
  return signed.signedUrl;
}

async function publishToInstagramAccount(businessAccountId: string, accessToken: string, imageUrl: string, caption: string): Promise<void> {
  const publicImageUrl = await resolvePublicImageUrl(imageUrl);

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
export async function postToStudioInstagram(imageUrl: string, caption: string): Promise<void> {
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!businessAccountId || !accessToken) return;
  await publishToInstagramAccount(businessAccountId, accessToken, imageUrl, caption);
}

// Posts to a member's own connected Instagram Business/Creator account.
// No-ops silently if the member never connected Instagram (see
// instagram_connections in instagram-connect.functions.ts). This is the
// best-effort path used by the automatic community-publish cross-post.
export async function postToUserInstagram(userId: string, imageUrl: string, caption: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: connection } = await supabaseAdmin.from("instagram_connections").select("ig_user_id,access_token").eq("user_id", userId).maybeSingle();
  if (!connection) return;
  await publishToInstagramAccount(connection.ig_user_id, connection.access_token, imageUrl, caption);
}

// Same as postToUserInstagram, but throws so the caller (the manual "Share
// to Instagram" button) can show the member a real success/error result.
export async function postToConnectedInstagramOrThrow(userId: string, imageUrl: string, caption: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: connection } = await supabaseAdmin.from("instagram_connections").select("ig_user_id,access_token").eq("user_id", userId).maybeSingle();
  if (!connection) throw new Error("Connect Instagram in Settings first.");
  await publishToInstagramAccount(connection.ig_user_id, connection.access_token, imageUrl, caption);
}
