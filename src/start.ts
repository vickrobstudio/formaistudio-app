import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Origins allowed to call our server functions / server routes cross-origin.
// `capacitor://localhost` is the iOS WKWebView origin; `https://localhost` is
// used by some Capacitor configurations. Add the Lovable preview origins too
// for in-browser native-emulator testing.
const ALLOWED_CROSS_ORIGINS = new Set([
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
]);

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  return ALLOWED_CROSS_ORIGINS.has(origin);
}

const corsMiddleware = createMiddleware().server(async ({ next, request }) => {
  const origin = request.headers.get("origin");
  const allowed = isAllowedOrigin(origin);

  // Short-circuit pre-flight requests so the browser/WebView lets the real
  // request through.
  if (allowed && request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "access-control-allow-headers":
          "authorization, content-type, x-formai-client, x-requested-with",
        "access-control-max-age": "86400",
        vary: "origin",
      },
    });
  }

  const result = await next();
  if (!allowed) return result;

  // `result` is a TanStack response wrapper, not necessarily a Response —
  // we attach headers on the outgoing Response via setResponseHeader in
  // server fns when needed. For server-route responses we mutate headers
  // when the next() result is a Response.
  if (result instanceof Response) {
    result.headers.set("access-control-allow-origin", origin);
    result.headers.set("vary", "origin");
  }
  return result;
});

// Reject cross-site server-function calls (CSRF) while keeping the Capacitor
// WKWebView working: the iOS shell calls server functions cross-origin, so
// requests whose Origin is in ALLOWED_CROSS_ORIGINS stay allowed. The
// middleware short-circuits on Sec-Fetch-Site when present (Origin is then
// ignored), so both matchers must account for the allowlist.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  secFetchSite: (value, ctx) =>
    value === "same-origin" || isAllowedOrigin(ctx.request.headers.get("origin")),
  origin: (value, ctx) => value === new URL(ctx.request.url).origin || isAllowedOrigin(value),
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [corsMiddleware, csrfMiddleware, errorMiddleware],
}));
