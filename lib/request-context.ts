/**
 * Request context utilities for tracking requests across the application
 *
 * Uses AsyncLocalStorage to provide request-scoped context without
 * explicit parameter passing.
 */

import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

export type RequestContext = {
  requestId: string;
  userId?: string;
  workspaceId?: string;
  startTime: number;
};

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context
 * Returns undefined if called outside of a request scope
 */
export const getRequestContext = (): RequestContext | undefined => {
  return asyncLocalStorage.getStore();
};

/**
 * Get the current request ID, or generate a new one if not in request scope
 */
export const getRequestId = (): string => {
  return getRequestContext()?.requestId ?? randomUUID();
};

/**
 * Run a function within a request context
 */
export const runWithContext = <T>(context: Partial<RequestContext>, fn: () => T): T => {
  const fullContext: RequestContext = {
    requestId: context.requestId ?? randomUUID(),
    userId: context.userId,
    workspaceId: context.workspaceId,
    startTime: context.startTime ?? Date.now(),
  };
  return asyncLocalStorage.run(fullContext, fn);
};

/**
 * Update the current request context (e.g., after authentication)
 */
export const updateRequestContext = (updates: Partial<RequestContext>): void => {
  const current = getRequestContext();
  if (current) {
    Object.assign(current, updates);
  }
};

/**
 * Extract request ID from headers (for distributed tracing)
 */
export const extractRequestId = (headers: Headers): string => {
  // Support common request ID headers
  return (
    headers.get("x-request-id") ??
    headers.get("x-correlation-id") ??
    headers.get("x-trace-id") ??
    randomUUID()
  );
};
