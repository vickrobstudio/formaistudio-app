import { createFileRoute } from "@tanstack/react-router";
import { completeInstagramConnection, InstagramConnectError, verifyInstagramOAuthState } from "@/lib/instagram-oauth.server";

/**
 * Facebook Login for Business redirects here after a member approves (or
 * denies) connecting their Instagram Business/Creator account. This route
 * is unauthenticated (Meta, not our app, calls it) — the signed `state`
 * param is what ties the callback back to a FormAI user.
 *
 * Register as a Valid OAuth Redirect URI in the Meta app dashboard:
 *   https://www.formaistudio.app/api/public/instagram/callback
 */
function redirectToSettings(params: Record<string, string>) {
  const url = new URL("https://www.formaistudio.app/settings");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

export const Route = createFileRoute("/api/public/instagram/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get("error");
        if (error) return redirectToSettings({ instagram: "error", reason: "denied" });

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return redirectToSettings({ instagram: "error", reason: "missing_params" });

        const verified = verifyInstagramOAuthState(state);
        if (!verified) return redirectToSettings({ instagram: "error", reason: "invalid_state" });

        let account: Awaited<ReturnType<typeof completeInstagramConnection>>;
        try {
          account = await completeInstagramConnection(code);
        } catch (cause) {
          console.error("Instagram OAuth callback failed:", cause);
          const reason = cause instanceof InstagramConnectError ? cause.message : "connect_failed";
          return redirectToSettings({ instagram: "error", reason });
        }

        // Separate try/catch: a failure here means the Instagram side
        // already succeeded — this is our own infra (e.g. a missing
        // Supabase env var), never an Instagram-account problem, so it
        // must never surface as "connect_failed".
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: dbError } = await supabaseAdmin.from("instagram_connections").upsert({
            user_id: verified.userId,
            ig_user_id: account.igUserId,
            ig_username: account.igUsername,
            page_id: account.pageId,
            access_token: account.pageAccessToken,
            updated_at: new Date().toISOString(),
          });
          if (dbError) throw dbError;
        } catch (cause) {
          console.error("Instagram connection save failed:", cause);
          return redirectToSettings({ instagram: "error", reason: "save_failed" });
        }
        return redirectToSettings({ instagram: "connected", username: account.igUsername });
      },
    },
  },
});
