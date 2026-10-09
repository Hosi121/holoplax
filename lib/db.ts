import type { DatabaseClient } from "../database/client";
import { getRuntime } from "../server/runtime";

// Resolve the event's D1 session lazily; no binding escapes its request lifetime.
const db = new Proxy({} as DatabaseClient, {
  get(_target, key) {
    return Reflect.get(getRuntime().db, key);
  },
});
export default db;
