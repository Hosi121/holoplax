/**
 * Environment configuration for the MCP server
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

export interface Config {
  databaseUrl: string;
  encryptionKey: string | undefined;
  // Transport settings
  transport: "stdio" | "http";
  httpPort: number;
  // Stdio mode only: static user/workspace
  workspaceId: string | undefined;
  userId: string | undefined;
  // HTTP mode only: NextAuth secret for JWT verification
  nextAuthSecret: string | undefined;
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const transport = optionalEnv("MCP_TRANSPORT", "stdio");
  if (transport !== "stdio" && transport !== "http") {
    throw new Error(`Invalid MCP_TRANSPORT: ${transport}. Must be "stdio" or "http"`);
  }

  cachedConfig = {
    databaseUrl: requireEnv("DATABASE_URL"),
    encryptionKey: optionalEnv("ENCRYPTION_KEY"),
    transport,
    httpPort: parseInt(optionalEnv("MCP_PORT", "3001")!, 10),
    workspaceId: optionalEnv("MCP_WORKSPACE_ID"),
    userId: optionalEnv("MCP_USER_ID"),
    nextAuthSecret: optionalEnv("NEXTAUTH_SECRET"),
  };

  return cachedConfig;
}

export function validateConfig(): void {
  const config = getConfig();

  if (config.transport === "stdio") {
    // Stdio mode requires static user/workspace
    if (!config.workspaceId) {
      throw new Error("MCP_WORKSPACE_ID is required in stdio mode");
    }
    if (!config.userId) {
      throw new Error("MCP_USER_ID is required in stdio mode");
    }
  } else {
    // HTTP mode requires NextAuth secret for JWT verification
    if (!config.nextAuthSecret) {
      throw new Error("NEXTAUTH_SECRET is required in http mode for JWT verification");
    }
  }
}
