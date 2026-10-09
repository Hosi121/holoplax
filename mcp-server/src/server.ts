import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// The local MCP process only bridges stdio to Workers; it needs neither DB access nor application secrets.
export async function startServer() {
  const endpoint = process.env.MCP_URL ?? `${process.env.APP_URL ?? "http://localhost:3000"}/mcp`;
  const key = process.env.MCP_API_KEY;
  if (!key) throw new Error("MCP_API_KEY is required");
  const client = new Client({ name: "holoplax-stdio", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    }),
  );
  const server = new Server(
    { name: "holoplax-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, () => client.listTools());
  server.setRequestHandler(CallToolRequestSchema, ({ params }) => client.callTool(params));
  await server.connect(new StdioServerTransport());
  const close = async () => {
    await server.close();
    await client.close();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}
