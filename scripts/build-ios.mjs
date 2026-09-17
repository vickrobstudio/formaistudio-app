import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--configLoader", "native"], {
  stdio: "inherit", env: { ...process.env, BUILD_TARGET: "ios" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
