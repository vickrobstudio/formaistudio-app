import { readFile, writeFile } from "node:fs/promises";

// TanStack's prerender starts a second Vite instance without propagating the
// config loader. Preserve the explicitly selected loader (e.g. native on
// Windows) instead of unexpectedly bundling the config a second time.
const file = new URL("../node_modules/@tanstack/start-plugin-core/dist/esm/vite/prerender.js", import.meta.url);
const source = await readFile(file, "utf8");
const before = "configFile: viteConfig.configFile,";
const after = before + "\n\t\t\tconfigLoader: viteConfig.configLoader,";
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error("Review the TanStack prerender compatibility patch after dependency updates.");
  await writeFile(file, source.replace(before, after));
}
