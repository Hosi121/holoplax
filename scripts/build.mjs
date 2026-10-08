import { build } from "esbuild";
import { build as buildClient } from "vite";
import "./generate-routes.mjs";

await buildClient();
await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  // Match the production defaults previously supplied by `next start`.
  banner: { js: 'process.env.NODE_ENV ??= "production";' },
  outfile: "dist/server/index.js",
});
