import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { verifyAuth } from "./auth.js";
import { runWithContext } from "./context.js";
import { getToolByName, listToolDefinitions } from "./tools/index.js";

// Stateless transport: every request rechecks the key/JWT and workspace membership.
export async function handleMcpRequest(request: Request): Promise<Response> {
  const auth = await verifyAuth(request.headers.get("authorization") ?? undefined);
  if (!auth.success) return Response.json({ error: auth.error }, { status: 401 });
  const server = new Server(
    { name: "holoplax-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listToolDefinitions() }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const tool = getToolByName(params.name);
    if (!tool) throw new Error(`Unknown tool: ${params.name}`);
    try {
      const result = await runWithContext(auth.context, () => tool.handler(params.arguments ?? {}));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          },
        ],
        isError: true,
      };
    }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
