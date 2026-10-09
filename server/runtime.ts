import { AsyncLocalStorage } from "node:async_hooks";
import { createDatabase, type DatabaseClient } from "../database/client";

type Runtime = { env: Env; execution: Pick<ExecutionContext, "waitUntil">; db: DatabaseClient };
const storage = new AsyncLocalStorage<Runtime>();
export function withRuntime<T>(
  env: Env,
  execution: Pick<ExecutionContext, "waitUntil">,
  operation: () => T,
): T {
  if (
    !env.DB ||
    !env.AUTH_SECRET ||
    env.AUTH_SECRET.length < 32 ||
    !/^[a-f0-9]{64}$/i.test(env.ENCRYPTION_KEY ?? "")
  ) {
    throw new Error(
      "DB, AUTH_SECRET (32+ characters), and ENCRYPTION_KEY (64 hex characters) are required",
    );
  }
  const url = new URL(env.APP_URL);
  if (
    env.ENVIRONMENT === "production" &&
    (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new Error("Production APP_URL must be a public HTTPS URL");
  }
  return storage.run({ env, execution, db: createDatabase(env.DB) }, operation);
}
export function getRuntime(): Runtime {
  const context = storage.getStore();
  if (!context) throw new Error("Cloudflare runtime context is unavailable");
  return context;
}
// Read configuration from the current event. The fallback supports pure Node unit tests.
// Bindings and secrets are never copied into process.env or a shared mutable global.
export const runtimeEnv: Record<string, string | undefined> = new Proxy(
  {},
  {
    get(_target, key: string) {
      const env = storage.getStore()?.env;
      if (key === "NODE_ENV" && env) return env.ENVIRONMENT;
      const value = env ? Reflect.get(env, key) : process.env[key];
      return typeof value === "string" ? value : undefined;
    },
  },
);
