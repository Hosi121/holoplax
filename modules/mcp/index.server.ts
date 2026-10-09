import { createMcpApiKeyCommands } from "./application/api-key-commands";
import { d1McpApiKeyPort } from "./infrastructure/d1-api-key-commands";

const commands = createMcpApiKeyCommands(d1McpApiKeyPort);
export const listMcpApiKeys = commands.list;
export const createMcpApiKey = commands.create;
export const revokeMcpApiKey = commands.revoke;
