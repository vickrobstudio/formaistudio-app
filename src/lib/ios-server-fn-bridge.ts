/**
 * When the app runs inside the Capacitor iOS shell (origin
 * `capacitor://localhost`), all TanStack server function calls would hit a
 * local path that does not exist. This module patches `window.fetch` once at
 * startup so any request to `/_serverFn/*` (or other same-origin API paths)
 * is rewritten to `https://formaistudio.app/...`, which is where the SSR
 * deployment actually serves the server-fn endpoints.
 *
 * In the browser (web build) this is a no-op.
 */
import { Capacitor } from "@capacitor/core";

const API_ORIGIN =
  (import.meta.env.VITE_API_ORIGIN as string | undefined) ?? "https://formaistudio.app";

// Paths that must be forwarded to the live SSR host when running natively.
// Server functions live under /_serverFn, server routes under /api.
const FORWARD_PREFIXES = ["/_serverFn", "/api"];

let installed = false;

export function installIosServerFnBridge(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform()) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === "string" || input instanceof URL
        ? new URL(input.toString(), window.location.href)
        : new URL(input.url, window.location.href);

      // Only rewrite same-origin requests that target a forwarded prefix.
      const sameOrigin = url.origin === window.location.origin;
      const shouldForward =
        sameOrigin && FORWARD_PREFIXES.some((p) => (url.pathname === p || url.pathname.startsWith(`${p}/`)));

      if (shouldForward) {
        const target = new URL(API_ORIGIN);
        target.pathname = url.pathname;
        target.search = url.search;

        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        // Pre-flight-friendly headers; the auth attacher already adds Authorization.
        if (!headers.has("x-formai-client")) headers.set("x-formai-client", "ios");

        const forwardedInit: RequestInit = {
          ...(init ?? {}),
          headers,
          // We can't use credentials: 'include' with wildcard CORS; bearer
          // tokens come from the Supabase auth attacher middleware instead.
          credentials: "omit",
          mode: "cors",
        };

        if (input instanceof Request) {
          // Apply caller overrides first, then preserve method, body and signal
          // while changing the destination and native transport settings.
          const request = new Request(input, init);
          return originalFetch(new Request(target.toString(), request), {
            headers,
            credentials: "omit",
            mode: "cors",
          });
        }
        return originalFetch(target.toString(), forwardedInit);
      }
    } catch {
      // Fall through to the original fetch on any URL parsing failure.
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof window.fetch;
}