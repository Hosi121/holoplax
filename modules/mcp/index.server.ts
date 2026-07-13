import { createMcpApiKeyCommands } from "./application/api-key-commands";
import { prismaMcpApiKeyPort } from "./infrastructure/prisma-api-key-commands";

const commands = createMcpApiKeyCommands(prismaMcpApiKeyPort);
export const listMcpApiKeys = commands.list;
export const createMcpApiKey = commands.create;
export const revokeMcpApiKey = commands.revoke;
