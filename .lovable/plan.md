
# Goal

Make the iOS `.ipa` ship its own UI inside the app (no Safari hand-off, no website loading). Keep `formaistudio.app` server-rendered exactly as it is today.

# How it works after this change

```text
Web site (formaistudio.app)            iOS app (.ipa from Codemagic)
┌─────────────────────────┐            ┌─────────────────────────┐
│ TanStack Start + SSR    │            │ Capacitor WKWebView     │
│ Server-rendered HTML    │            │ Loads bundled SPA from  │
│ Server functions inline │            │ inside the .ipa         │
└──────────┬──────────────┘            │ (no internet needed     │
           │                            │  to open the app)       │
           │                            └──────────┬──────────────┘
           │ shares                                │ calls over HTTPS
           ▼                                       ▼
              ┌────────────────────────────────────────┐
              │ Server functions on formaistudio.app   │
              │ (auth, payments, AI gen, DB)           │
              └────────────────────────────────────────┘
```

One codebase, two builds:
- `bun run build` — unchanged. Produces the SSR site for Lovable / formaistudio.app.
- `bun run build:ios` — new. Produces a static SPA in `dist-ios/` that Capacitor packages into the `.ipa`. UI shell opens with no network; every data call hits `https://formaistudio.app/_serverFn/...` over HTTPS with CORS.

# What changes

## 1. iOS SPA build target
- New `vite.config.ios.ts` that builds the client only (no SSR, no Nitro), output dir `dist-ios/`.
- New `src/main.ios.tsx` entry that mounts `<RouterProvider>` on the client (no `StartClient` / SSR hydration path).
- New `index.html` at project root used only by the iOS build.
- `package.json`: `"build:ios": "vite build --config vite.config.ios.ts"`.

## 2. Route loaders made SPA-safe
Loaders that call `requireSupabaseAuth`-protected server functions during SSR are already gated by `_authenticated/` and work fine. For the SPA build there is no SSR, so loaders only run on the client and the bundled app will behave like a normal SPA — first paint is a loading skeleton, then loader data arrives. No code change needed for most routes; a couple of public routes that currently rely on SSR HTML for first paint will show a brief loader. The home / landing route stays instant because it's pure static markup.

## 3. Server functions reachable cross-origin
The iOS WebView runs on `capacitor://localhost`. Server functions live on `https://formaistudio.app`. Two things to wire:
- A small `setServerFnFetcher` shim in `src/main.ios.tsx` that rewrites the server-fn URL to `https://formaistudio.app` and forwards Supabase auth headers.
- `attachSupabaseAuth` already handles the bearer token; we just need CORS allowed on the server-fn endpoint for the `capacitor://localhost` origin. Add a small request-middleware step in `src/start.ts` that, on `OPTIONS` and on responses to requests with `Origin: capacitor://localhost` (or `https://localhost`), sets `Access-Control-Allow-Origin`, `-Methods`, `-Headers: authorization, content-type`, `-Credentials: true`.

## 4. Capacitor config
- `capacitor.config.ts`: remove `server.url` and `server.allowNavigation`. Set `webDir: "dist-ios"`. Keep iOS plugin config (splash, status bar, keyboard, haptics).
- `codemagic.yaml`: insert `bun run build:ios` before `npx cap sync ios`. Drop the `WKAppBoundDomains` PlistBuddy block — no longer needed because the app no longer loads remote pages as its main document. (Web-origin fetches for server functions don't need it.)

## 5. Supabase auth in the bundled app
`@supabase/supabase-js` persists the session in `localStorage` inside the WebView — works the same as in a browser. Sign-in via Google OAuth will open `SFSafariViewController` and return via a deep link. Add `app.formaistudio.formai://auth/callback` as an allowed redirect in Supabase Auth → URL configuration, and register the URL scheme in the Codemagic `Info.plist` step. (One-time config change in Lovable Cloud Auth settings; I'll show you exactly where.)

## 6. Verification before TestFlight
- `bun run build:ios` produces `dist-ios/index.html` + assets, no SSR warnings.
- `bun run build` still produces a working SSR site (no regression on web).
- Use Playwright against `localhost:8080` (web) to confirm landing/dashboard still render via SSR.
- After Codemagic builds, install on a device and verify: cold launch in airplane mode shows the UI (proves it's bundled), turn wifi on and sign-in/generate work (proves cross-origin server-fn calls work).

# Technical details

**Files added**
- `vite.config.ios.ts` — client-only build, `build.outDir: "dist-ios"`, no `tanstackStart` plugin, no `nitro` block.
- `src/main.ios.tsx` — `createRouter` + `RouterProvider`, sets `setServerFnFetcher` to rewrite to `import.meta.env.VITE_API_ORIGIN`.
- `index.html` — minimal HTML shell with `<div id="root">` and `<script type="module" src="/src/main.ios.tsx">`.
- `src/lib/ios-server-fn-fetcher.ts` — small wrapper that prepends `VITE_API_ORIGIN` and includes credentials.

**Files modified**
- `capacitor.config.ts` — remove `server`, set `webDir: "dist-ios"`.
- `codemagic.yaml` — add `bun run build:ios` step; remove `WKAppBoundDomains` plist edits.
- `src/start.ts` — add `corsMiddleware` to `requestMiddleware` that allows `capacitor://localhost` and `https://localhost` origins on server-fn paths only.
- `package.json` — `build:ios` script.
- `.env.production` (iOS-only var) — `VITE_API_ORIGIN=https://formaistudio.app`.

**Files NOT touched**
- `src/integrations/supabase/*` (auto-generated)
- Existing routes / components (they work as-is under the SPA build because they're already client-rendered after hydration)
- The current `bun run build` pipeline

# Risk and rollback

The web SSR build is untouched — the SPA build is additive. If anything goes wrong with the iOS build, the web site is unaffected. Rollback is `git revert` of the new files plus restoring `server.url` in `capacitor.config.ts`.

# Out of scope

- Push notifications (separate work if you want them later)
- Apple Sign In (only needed if you keep social sign-in and Apple's review flags Google-only)
- iPad-specific layouts (current responsive layout already covers iPad)

After you approve, I'll implement everything above in one pass and you'll just need to:
1. Add `app.formaistudio.formai://auth/callback` to Supabase Auth allowed redirect URLs (I'll point to the exact setting).
2. Re-run the Codemagic build.
