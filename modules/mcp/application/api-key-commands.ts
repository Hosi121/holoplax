export interface McpApiKeyPort {
  list(userId: string): Promise<unknown[]>;
  create(input: {
    userId: string;
    name: string;
    workspaceId: string;
    expiresInDays?: number;
  }): Promise<Record<string, unknown>>;
  revoke(userId: string, keyId: string): Promise<void>;
}

export const createMcpApiKeyCommands = (port: McpApiKeyPort) => ({
  list: (userId: string) => port.list(userId),
  create: (input: Parameters<McpApiKeyPort["create"]>[0]) => port.create(input),
  revoke: (userId: string, keyId: string) => port.revoke(userId, keyId),
});
