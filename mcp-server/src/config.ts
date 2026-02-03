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
  workspaceId: string;
  userId: string;
  encryptionKey: string | undefined;
  // HTTP transport settings
  transport: "stdio" | "http";
  httpPort: number;
  apiKey: string | undefined;
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
    workspaceId: requireEnv("MCP_WORKSPACE_ID"),
    userId: requireEnv("MCP_USER_ID"),
    encryptionKey: optionalEnv("ENCRYPTION_KEY"),
    transport,
    httpPort: parseInt(optionalEnv("MCP_PORT", "3001")!, 10),
    apiKey: optionalEnv("MCP_API_KEY"),
  };

  return cachedConfig;
}

export function validateConfig(): void {
  getConfig();
}
