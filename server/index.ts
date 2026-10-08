import "../lib/env";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { registerNodeInstrumentation } from "./bootstrap";

await registerNodeInstrumentation();
const server = serve({
  fetch: createApp().fetch,
  port: Number(process.env.PORT ?? 3000),
  hostname: process.env.APP_HOST ?? "0.0.0.0",
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
