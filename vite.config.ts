// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// BUILD_TARGET=ios switches the build into a static SPA bundle that ships
// inside the iOS .ipa (loaded by Capacitor's WKWebView, no website fetch on
// launch). The default (unset) keeps the SSR build used for the web app.
const isIosBuild = process.env.BUILD_TARGET === "ios";
const IOS_ASSET_ORIGIN =
  process.env.VITE_API_ORIGIN ?? "https://formaistudio.app";

// When bundling for the iOS WKWebView, .asset.json pointers carry
// root-relative CDN paths like "/__l5e/assets-v1/...". Those resolve to
// `capacitor://localhost/__l5e/...` inside the app and 404. Rewrite the
// `url` field at build time to an absolute https URL on the live host so
// images, fonts, and wallpapers load from the CDN.
const iosAssetUrlRewriter = {
  name: "lovable-ios-asset-url-rewriter",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.endsWith(".asset.json")) return null;
    try {
      const json = JSON.parse(code);
      if (typeof json.url === "string" && json.url.startsWith("/")) {
        json.url = IOS_ASSET_ORIGIN.replace(/\/$/, "") + json.url;
        return { code: JSON.stringify(json), map: null };
      }
    } catch {
      // leave untouched on parse failure
    }
    return null;
  },
};

export default defineConfig({
  vite: {
    optimizeDeps: {
      exclude: ["three/examples/jsm/loaders/ColladaLoader.js"],
    },
    plugins: isIosBuild ? [...(isIosBuild ? [iosAssetUrlRewriter] : []),] : [],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this. The iOS SPA build prerenders a static
    // shell instead of running real SSR, so it uses the default entry.
    ...(isIosBuild ? {} : { server: { entry: "server" } }),
    // For the iOS shell, prerender a static SPA shell so the .ipa boots
    // without needing any server. Server functions still run on
    // formaistudio.app; the bundled app fetches them cross-origin.
    ...(isIosBuild
      ? {
          spa: {
            enabled: true,
            // Emit the SPA shell as dist/client/index.html so Capacitor's
            // WKWebView finds it as the default document.
            prerender: { outputPath: "/index.html" },
          },
        }
      : {}),
  },
  // The iOS build prerenders a SPA shell. Prerendering boots a plain Vite
  // SSR preview server (which expects `dist/server/server.js`), so we
  // disable Nitro for this build — Nitro would rewrite the server output
  // into a worker bundle the preview server can't load.
  ...(isIosBuild ? { nitro: false } : {}),
});
