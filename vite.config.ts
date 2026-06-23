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

export default defineConfig({
  vite: {
    optimizeDeps: {
      exclude: ["three/examples/jsm/loaders/ColladaLoader.js"],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this. The iOS SPA build prerenders a static
    // shell instead of running real SSR, so it uses the default entry.
    ...(isIosBuild ? {} : { server: { entry: "server" } }),
    // For the iOS shell, prerender a static SPA shell so the .ipa boots
    // without needing any server. Server functions still run on
    // formaistudio.app; the bundled app fetches them cross-origin.
    ...(isIosBuild ? { spa: { enabled: true } } : {}),
  },
  // The iOS build prerenders a SPA shell. Prerendering boots a Node
  // preview server from the SSR output, which requires a Node-compatible
  // nitro preset rather than the default cloudflare-module worker bundle.
  ...(isIosBuild ? { nitro: { preset: "node-server" } } : {}),
});
