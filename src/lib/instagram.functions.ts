import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submissionInput = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(2200),
  imageDataUrl: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).max(3_000_000),
  consent: z.literal(true),
});
const idInput = z.object({ id: z.string().uuid() });
function requireModerator(userId: string) {
  const ids = (process.env.FORMAI_INSTAGRAM_REVIEWER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!ids.includes(userId)) throw new Error("Only the FormAI reviewer can perform this action.");
}
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as SupabaseClient;
}
function instagramConfig() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const account = process.env.INSTAGRAM_ACCOUNT_ID;
  const version = process.env.INSTAGRAM_API_VERSION;
  if (!token || !account || !/^v\d+\.\d+$/.test(version ?? "")) throw new Error("Instagram publishing is not configured yet.");
  return { token, account, base: `https://graph.instagram.com/${version}` };
}

export const submitInstagramCreation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).validator((input: unknown) => submissionInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const old = await db.from("instagram_submissions").select("id,status").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (old.error) throw new Error("Instagram submissions are not available yet.");
    if (old.data) return old.data as { id: string; status: string };
    const result = await db.from("instagram_submissions").insert({ id: data.id, user_id: context.userId, title: data.title, caption: data.caption, image_data_url: data.imageDataUrl }).select("id,status").single();
    if (result.error) throw new Error("Unable to submit the creation. Please retry.");
    return result.data as { id: string; status: string };
  });

export const getInstagramReviewQueue = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requireModerator(context.userId);
    const db = await admin();
    const result = await db.from("instagram_submissions").select("id,title,caption,image_data_url,status,created_at,instagram_media_id").order("created_at", { ascending: false }).limit(20);
    if (result.error) throw new Error("Unable to load Instagram submissions.");
    return result.data as Array<{ id: string; title: string; caption: string; image_data_url: string; status: string; created_at: string; instagram_media_id: string | null }>;
  });

export const reviewInstagramSubmission = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((input: unknown) => idInput.extend({ decision: z.enum(["approved", "rejected"]) }).parse(input))
  .handler(async ({ data, context }) => {
    requireModerator(context.userId);
    const db = await admin();
    const result = await db.from("instagram_submissions").update({ status: data.decision, reviewed_by: context.userId, reviewed_at: new Date().toISOString() }).eq("id", data.id).eq("status", "pending").select("id,status").maybeSingle();
    if (result.error || !result.data) throw new Error("This submission has already changed. Refresh the queue.");
    return { status: data.decision };
  });

export const publishApprovedInstagramSubmission = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    requireModerator(context.userId);
    const config = instagramConfig();
    const db = await admin();
    // Atomic transition: another click or request cannot publish the same item twice.
    const claim = await db.from("instagram_submissions").update({ status: "publishing" }).eq("id", data.id).eq("status", "approved").select("id,caption,image_data_url").maybeSingle();
    if (claim.error || !claim.data) throw new Error("Only an approved, unpublished submission can be published. Refresh the queue.");
    let publishAttempted = false;
    try {
      const row = claim.data;
      const bytes = Buffer.from(row.image_data_url.split(",")[1], "base64");
      const path = `instagram-approved/${row.id}.jpg`;
      const upload = await db.storage.from("user-outputs").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (upload.error) throw new Error("Unable to prepare the approved image.");
      const signed = await db.storage.from("user-outputs").createSignedUrl(path, 7200);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Unable to prepare the approved image URL.");
      const headers = { Authorization: `Bearer ${config.token}` };
      const created = await fetch(`${config.base}/${config.account}/media`, { method: "POST", headers, body: new URLSearchParams({ image_url: signed.data.signedUrl, caption: row.caption }), signal: AbortSignal.timeout(30000) });
      const container = await created.json().catch(() => ({}));
      if (!created.ok || !container.id) throw new Error("Instagram could not prepare the post. Check the account connection and image requirements.");
      const recorded = await db.from("instagram_submissions").update({ container_id: container.id }).eq("id", row.id).eq("status", "publishing");
      if (recorded.error) throw new Error("Unable to record the prepared post.");
      const statusResponse = await fetch(`${config.base}/${container.id}?fields=status_code`, { headers, signal: AbortSignal.timeout(15000) });
      const containerStatus = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok || containerStatus.status_code !== "FINISHED") throw new Error("Instagram is still preparing the image or rejected its format. Nothing was published; retry after checking the image.");
      // Do not retry a publish request automatically: a timeout can hide a successful post.
      publishAttempted = true;
      const response = await fetch(`${config.base}/${config.account}/media_publish`, { method: "POST", headers, body: new URLSearchParams({ creation_id: container.id }), signal: AbortSignal.timeout(30000) });
      const published = await response.json().catch(() => ({}));
      if (!response.ok || !published.id) throw new Error("Publishing needs manual verification. Check Instagram before retrying.");
      const saved = await db.from("instagram_submissions").update({ status: "published", instagram_media_id: published.id, published_at: new Date().toISOString() }).eq("id", row.id).eq("status", "publishing");
      if (saved.error) throw new Error("Instagram accepted the post but its saved status needs verification. Do not publish it again.");
      return { status: "published", mediaId: String(published.id) };
    } catch (cause) {
      const recovered = await db.from("instagram_submissions").update({ status: publishAttempted ? "needs_review" : "approved" }).eq("id", data.id).eq("status", "publishing");
      if (recovered.error) throw new Error("Publication status could not be saved. Check Instagram and the queue before retrying.");
      throw cause;
    }
  });

