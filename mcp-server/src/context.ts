import { AsyncLocalStorage } from "async_hooks";
import { getConfig } from "./config.js";

/**
 * Execution context for MCP operations
 * Provides workspace and user information for all operations
 */
export interface ExecutionContext {
  workspaceId: string;
  userId: string;
}

// AsyncLocalStorage for per-request context in HTTP mode
const contextStorage = new AsyncLocalStorage<ExecutionContext>();

/**
 * Get the current execution context
 * In HTTP mode: uses per-request context from authentication
 * In stdio mode: falls back to environment variables
 */
export function getContext(): ExecutionContext {
  // Try to get context from AsyncLocalStorage (HTTP mode)
  const asyncContext = contextStorage.getStore();
  if (asyncContext) {
    return asyncContext;
  }

  // Fallback to config-based context (stdio mode)
  const config = getConfig();
  if (!config.workspaceId || !config.userId) {
    throw new Error("No execution context available. In HTTP mode, authentication is required.");
  }
  return {
    workspaceId: config.workspaceId,
    userId: config.userId,
  };
}

/**
 * Run a function with a specific execution context
 */
export function runWithContext<T>(context: ExecutionContext, fn: () => T): T {
  return contextStorage.run(context, fn);
}

/**
 * Set context for the current async scope (for use in HTTP handlers)
 */
export function setContext(context: ExecutionContext): void {
  const store = contextStorage.getStore();
  if (store) {
    Object.assign(store, context);
  }
}
