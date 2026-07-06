import process from "node:process";

// Server-only. Cross-posts a published community creation to the studio's
// own Instagram Business account (@formaistudio.app) via the Instagram
// Graph API. Configure INSTAGRAM_BUSINESS_ACCOUNT_ID and
// INSTAGRAM_ACCESS_TOKEN (a long-lived Page access token with the
// instagram_content_publish permission) in Vercel — until both are set
// this silently no-ops so publishing to the community feed is never
// blocked by it.
const GRAPH_VERSION = "v21.0";

async function resolvePublicImageUrl(imageUrl: string): Promise<string | null> {
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  const match = /^data:([^;]+);base64,(.+)$/.exec(imageUrl);
  if (!match) return null;
  const [, contentType, base64] = match;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = `instagram-posts/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await supabaseAdmin.storage.from("user-outputs").upload(path, Buffer.from(base64, "base64"), { contentType });
  if (error) return null;
  // Instagram fetches the image once while creating the media container —
  // a short-lived signed URL is plenty and avoids exposing it any longer.
  const { data: signed } = await supabaseAdmin.storage.from("user-outputs").createSignedUrl(path, 900);
  return signed?.signedUrl ?? null;
}

export async function postToStudioInstagram(imageUrl: string, caption: string): Promise<void> {
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!businessAccountId || !accessToken) return;

  const publicImageUrl = await resolvePublicImageUrl(imageUrl);
  if (!publicImageUrl) return;

  const createRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${businessAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: publicImageUrl, caption: caption.slice(0, 2200), access_token: accessToken }),
  });
  const created = await createRes.json().catch(() => null) as { id?: string } | null;
  if (!createRes.ok || !created?.id) return;

  await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${businessAccountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: created.id, access_token: accessToken }),
  });
}
