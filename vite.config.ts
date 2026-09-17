import { defineConfig, type PluginOption } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { lstat, readlink } from "node:fs/promises";

// BUILD_TARGET=ios switches the build into a static SPA bundle that ships
// inside the iOS .ipa (loaded by Capacitor's WKWebView, no website fetch on
// launch). The default (unset) keeps the SSR build used for the web app.
const isIosBuild = process.env.BUILD_TARGET === "ios";

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // src/server.ts is our SSR error wrapper. The iOS SPA build prerenders
      // a static shell instead of running real SSR, so it uses the default
      // entry and ships without a server.
      ...(isIosBuild
        ? {
            spa: {
              enabled: true,
              // Emit the SPA shell as dist/client/index.html so Capacitor's
              // WKWebView finds it as the default document.
              prerender: { outputPath: "/index.html" },
            },
          }
        : { server: { entry: "server" } }),
    }),
    viteReact(),
  ];

  // Nitro bundles the server for deployment — build-time only, and not for
  // the iOS static shell (which prerenders via a plain Vite preview server).
  if (command === "build" && !isIosBuild) {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({
      preset: "vercel",
      // On Windows a regular ancestor directory can return EPERM to readlink.
      // Inspect its type first; real symlinks and all access errors still use
      // the normal filesystem behavior. Never suppress a failed lstat.
      ...(process.platform === "win32" ? {
        traceOpts: { nft: { readlink: async (path: string) => (await lstat(path)).isSymbolicLink() ? readlink(path) : null } },
      } : {}),
      // Claude floor-plan analyses can run for minutes; without this Vercel
      // kills the function at its short default and the 2D→3D tool fails.
      vercel: { functions: { maxDuration: 300 } },
    } as Parameters<typeof nitro>[0]));
  }

  return {
    plugins,
    server: { port: 8080, host: true },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "@tanstack/react-router",
        "@tanstack/react-start",
        "@tanstack/react-query",
      ],
    },
    optimizeDeps: {
      exclude: ["three/examples/jsm/loaders/ColladaLoader.js"],
    },
  };
});
