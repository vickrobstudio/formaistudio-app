import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const isIosBuild = process.env.BUILD_TARGET === "ios";

const IOS_ASSET_ORIGIN =
  process.env.VITE_API_ORIGIN ?? "https://formaistudio.app";

const iosAssetUrlRewriter = {
  name: "formai-ios-asset-url-rewriter",
  enforce: "pre" as const,

  transform(code: string, id: string) {
    if (!id.endsWith(".asset.json")) return null;

    try {
      const json = JSON.parse(code);

      if (typeof json.url === "string" && json.url.startsWith("/")) {
        json.url =
          IOS_ASSET_ORIGIN.replace(/\/$/, "") + json.url;

        return {
          code: JSON.stringify(json),
          map: null,
        };
      }
    } catch {
      // Leave asset metadata untouched if parsing fails.
    }

    return null;
  },
};

export default defineConfig({
  optimizeDeps: {
    exclude: ["three/examples/jsm/loaders/ColladaLoader.js"],
  },

  plugins: [
    tsConfigPaths(),

    ...iosAssetUrlRewriter,

    tanstackStart(
      isIosBuild
        ? {
            spa: {
              enabled: true,
              prerender: {
                outputPath: "/index.html",
              },
            },
          }
        : {},
    ),

    ...(isIosBuild ? [] : [nitro()]),

    viteReact(),

    tailwindcss(),
  ],

  resolve: {
    alias: {
      "@": "/src",
    },
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-start",
    ],
  },
});
