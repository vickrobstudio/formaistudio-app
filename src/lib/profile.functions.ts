import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UsernameInput = z.object({
  username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$/),
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("profiles").select("email,username,avatar_path").eq("id", context.userId).single();
    if (error) throw new Error("Unable to load your profile.");
    let avatarUrl: string | null = null;
    if (data.avatar_path) {
      const signed = await context.supabase.storage.from("user-outputs").createSignedUrl(data.avatar_path, 3_600);
      avatarUrl = signed.data?.signedUrl ?? null;
    }
    return { ...data, avatarUrl };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UsernameInput.parse(input))
  .handler(async ({ data, context }) => {
    const username = data.username.trim();
    const { error } = await context.supabase.from("profiles").update({ username, updated_at: new Date().toISOString() }).eq("id", context.userId);
    if (error?.code === "23505") throw new Error("That username is already taken.");
    if (error) throw new Error("Unable to update your username.");
    const { error: creationsError } = await context.supabase.from("public_creations").update({ creator_name: username }).eq("user_id", context.userId);
    const { error: commentsError } = await context.supabase.from("creation_comments").update({ author_name: username }).eq("user_id", context.userId);
    if (creationsError || commentsError) throw new Error("Your profile was saved, but older feed credits could not be updated.");
    return { username };
  });

export const setMyAvatarPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ avatarPath: z.string().max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const expectedPath = `${context.userId}/profile/avatar`;
    if (data.avatarPath !== expectedPath) throw new Error("Invalid profile photo location.");
    const { error } = await context.supabase.from("profiles").update({ avatar_path: expectedPath, updated_at: new Date().toISOString() }).eq("id", context.userId);
    if (error) throw new Error("Unable to save your profile photo.");
    return { ok: true };
  });

async function listStorageFiles(bucket: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const paths: string[] = [];
  async function walk(prefix: string) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1_000 });
    if (error) throw error;
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      if (item.id) paths.push(path);
      else await walk(path);
    }
  }
  await walk(userId);
  return paths;
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ confirmation: z.literal("DELETE") }).parse(input))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const bucket of ["plan-uploads", "sketchup-uploads", "tearsheet-uploads", "user-outputs"]) {
      const paths = await listStorageFiles(bucket, context.userId);
      if (paths.length) {
        const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
        if (error) throw new Error("Unable to remove all account files.");
      }
    }
    for (const table of ["creation_favorites", "creation_likes", "creation_comments", "public_creations", "photo_ai_messages", "user_cloud_outputs", "studio_projects", "design_proposals", "product_tearsheets", "ai_rules", "feature_usage", "guest_credit_claims", "iap_entitlements", "user_subscriptions", "contact_requests"] as const) {
      const { error } = await supabaseAdmin.from(table).delete().eq("user_id", context.userId);
      if (error) throw new Error("Unable to remove all account data.");
    }
    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", context.userId);
    if (profileError) throw new Error("Unable to remove the profile.");
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (authError) throw new Error("Unable to permanently delete the account.");
    return { deleted: true };
  });