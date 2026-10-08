import { spawn } from "node:child_process";
import { createServer } from "vite";
import "./generate-routes.mjs";

const vite = await createServer();
await vite.listen();
const server = spawn(process.execPath, ["--watch", "--import", "tsx", "server/index.ts"], {
  stdio: "inherit",
  env: { ...process.env, HOLOPLAX_DEV: "1" },
});
server.on("exit", async (code) => {
  await vite.close();
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    server.kill(signal);
  });
