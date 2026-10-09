import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { createDatabase } from "./client";

export async function createTestDatabase() {
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: "database-tests",
          compatibilityDate: "2026-10-06",
          manifest: {
            mainModule: "index.js",
            modules: {
              "index.js": {
                type: "esm",
                contents: 'export default {fetch() {return new Response("ok")}}',
              },
            },
          },
          env: { DB: { type: "d1", id: "database-tests" } },
        },
      },
    ],
  });
  try {
    const binding = await runtime.getD1Database("DB", "database-tests");
    const migration = await readFile(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    );
    const statements = migration
      .replace(/^--.*$/gm, "")
      .split(/\n\s*\n/)
      .map((sql) => sql.trim())
      .filter(Boolean);
    await binding.batch(statements.map((sql) => binding.prepare(sql)));
    return { binding, db: createDatabase(binding), dispose: () => runtime.dispose() };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}

// Tests use only these event bindings; HTTP/R2/Queues are exercised by the Worker E2E.
export function testEvent(binding: D1Database) {
  return {
    env: {
      DB: binding,
      AUTH_SECRET: "test-session-secret-at-least-32-characters",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      APP_URL: "http://localhost:3000",
      ENVIRONMENT: "test",
    } as Env,
    execution: { waitUntil() {} },
  };
}
