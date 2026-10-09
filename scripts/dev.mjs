import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import "./generate-routes.mjs";

const cli = [
  "node_modules/wrangler/bin/wrangler.js",
  ...(process.env.HOLOPLAX_LOCAL_CONFIG ? ["--config", process.env.HOLOPLAX_LOCAL_CONFIG] : []),
];
const state = process.env.HOLOPLAX_LOCAL_STATE
  ? ["--persist-to", process.env.HOLOPLAX_LOCAL_STATE]
  : [];
const migration = spawnSync(
  process.execPath,
  [...cli, "d1", "migrations", "apply", "DB", "--local", ...state],
  { stdio: "inherit" },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
// Wrangler requires an assets directory even when the Worker proxies Vite.
const assets = ".wrangler/dev-assets";
await mkdir(assets, { recursive: true });
await writeFile(`${assets}/index.html`, "<!doctype html><title>Vite development</title>");
const vite = await createServer();
let worker;
try {
  await vite.listen();
  worker = spawn(
    process.execPath,
    [
      ...cli,
      "dev",
      ...state,
      "--assets",
      assets,
      "--var",
      "HOLOPLAX_DEV:1",
      "--show-interactive-dev-session=false",
    ],
    { stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => worker.kill(signal));
  process.exitCode = await new Promise((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code) => resolve(code ?? 0));
  });
} finally {
  if (worker?.exitCode === null && !worker.killed) worker.kill("SIGTERM");
  await vite.close();
  await rm(assets, { recursive: true, force: true });
}
