import { getConfig } from "./config.js";

/**
 * Execution context for MCP operations
 * Provides workspace and user information for all operations
 */
export interface ExecutionContext {
  workspaceId: string;
  userId: string;
}

export function getContext(): ExecutionContext {
  const config = getConfig();
  return {
    workspaceId: config.workspaceId,
    userId: config.userId,
  };
}
