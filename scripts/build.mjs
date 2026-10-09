import { spawnSync } from "node:child_process";
import { build } from "vite";
import "./generate-routes.mjs";
await build();
const result = spawnSync(
  process.execPath,
  ["node_modules/wrangler/bin/wrangler.js", "deploy", "--dry-run", "--outdir", "dist/worker"],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
