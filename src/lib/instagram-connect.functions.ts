import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildInstagramAuthorizeUrl, completeInstagramConnection, verifyInstagramOAuthState } from "@/lib/instagram-oauth.server";
import { postToConnectedInstagramOrThrow, postToStudioInstagramOrThrow } from "@/lib/instagram-publish.server";

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

const CompleteInstagramConnectInput = z.object({ code: z.string().min(1), state: z.string().min(1) });

/**
 * Finishes the OAuth exchange after Meta redirects back to /settings with
 * ?code=&state=. Runs as an authenticated server function (not a public
 * route) specifically so the instagram_connections write happens through
 * the member's own Supabase JWT (RLS) — never the service-role key.
 */
export const completeInstagramConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompleteInstagramConnectInput.parse(input))
  .handler(async ({ data, context }) => {
    const verified = verifyInstagramOAuthState(data.state);
    if (!verified || verified.userId !== context.userId) throw new Error("That Instagram link expired. Please try connecting again.");
    const account = await completeInstagramConnection(data.code);
    const { error } = await context.supabase.from("instagram_connections").upsert({
      user_id: context.userId,
      ig_user_id: account.igUserId,
      ig_username: account.igUsername,
      page_id: account.pageId,
      access_token: account.pageAccessToken,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Instagram connected, but we could not save it. Please try again.");
    return { username: account.igUsername };
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
    await postToConnectedInstagramOrThrow(context.supabase, context.userId, data.imageUrl, data.caption);
    return { posted: true };
  });

/**
 * Every signed-in member can post their creation to the studio's own
 * @formaistudio.app account — no personal Instagram connection or Meta
 * app review needed. The caption always credits the member.
 */
export const shareToStudioInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ShareToMyInstagramInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase.from("profiles").select("username").eq("id", context.userId).maybeSingle();
    const credit = profile?.username ? `\n\nBy ${profile.username} on FormAI Studio.` : "\n\nMade with FormAI Studio.";
    await postToStudioInstagramOrThrow(context.supabase, context.userId, data.imageUrl, `${data.caption}${credit}`.slice(0, 2200));
    return { posted: true };
  });
