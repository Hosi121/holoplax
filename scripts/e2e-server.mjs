import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scratch = await mkdtemp(join(tmpdir(), "holoplax-e2e-"));
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
config.name = "holoplax-e2e";
config.main = resolve(config.main);
config.assets.directory = resolve(config.assets.directory);
config.d1_databases[0].migrations_dir = resolve(config.d1_databases[0].migrations_dir);
config.vars = {
  ...config.vars,
  ENVIRONMENT: "test",
  AUTH_SECRET: "e2e-session-secret-at-least-32-characters",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};
delete config.secrets;
const file = join(scratch, "wrangler.json");
await writeFile(file, JSON.stringify(config));
let child;
async function cleanup() {
  await rm(scratch, { recursive: true, force: true });
}
try {
  if (!process.env.E2E_BUILD_READY) {
    const build = spawnSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
    if (build.status !== 0) throw new Error("E2E build failed");
  }
  const cli = ["node_modules/wrangler/bin/wrangler.js"];
  const migration = spawnSync(
    process.execPath,
    [
      ...cli,
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      file,
      "--persist-to",
      join(scratch, "state"),
    ],
    { stdio: "inherit" },
  );
  if (migration.status !== 0) throw new Error("E2E migration failed");
  child = spawn(
    process.execPath,
    [
      ...cli,
      "dev",
      "--config",
      file,
      "--persist-to",
      join(scratch, "state"),
      "--show-interactive-dev-session=false",
    ],
    { stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
  const code = await new Promise((resolve) => child.once("exit", resolve));
  process.exitCode = code ?? 0;
} finally {
  await cleanup();
}
