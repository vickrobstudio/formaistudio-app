import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildInstagramAuthorizeUrl } from "@/lib/instagram-oauth.server";
import { postToConnectedInstagramOrThrow } from "@/lib/instagram-publish.server";

export const getMyInstagramConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("instagram_connections").select("ig_username").eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error("Unable to check your Instagram connection.");
    return { connected: !!data, username: data?.ig_username ?? null };
  });

export const startInstagramConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return { authorizeUrl: buildInstagramAuthorizeUrl(context.userId) };
  });

export const disconnectInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("instagram_connections").delete().eq("user_id", context.userId);
    if (error) throw new Error("Unable to disconnect Instagram.");
    return { disconnected: true };
  });

const ShareToMyInstagramInput = z.object({
  imageUrl: z.string().min(1).max(8_000_000),
  caption: z.string().max(2_200),
});

/** Posts an image straight to the caller's own connected Instagram account. Throws if none is connected. */
export const shareToMyInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ShareToMyInstagramInput.parse(input))
  .handler(async ({ data, context }) => {
    await postToConnectedInstagramOrThrow(context.userId, data.imageUrl, data.caption);
    return { posted: true };
  });
