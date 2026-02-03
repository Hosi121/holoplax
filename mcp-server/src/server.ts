import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import express from "express";
import { type AuthContext, verifyAuth } from "./auth.js";
import { getConfig, validateConfig } from "./config.js";
import { type ExecutionContext, runWithContext } from "./context.js";
import { getToolByName, listToolDefinitions } from "./tools/index.js";

// Session to auth context mapping for HTTP mode
const sessionContextMap = new Map<string, ExecutionContext>();

export async function createServer(sessionId?: string): Promise<Server> {
  validateConfig();

  const server = new Server(
    {
      name: "holoplax-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: listToolDefinitions(),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = getToolByName(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      // In HTTP mode, get context from session map
      const context = sessionId ? sessionContextMap.get(sessionId) : undefined;

      let result: unknown;
      if (context) {
        // Run with authenticated context
        result = await runWithContext(context, () => tool.handler(args ?? {}));
      } else {
        // Stdio mode: context comes from env vars
        result = await tool.handler(args ?? {});
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("holoplax MCP server started (stdio)");
}

export async function startHttpServer(): Promise<void> {
  const config = getConfig();
  const port = config.httpPort;

  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Session management: transport and auth context
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // MCP endpoint with JWT authentication
  app.all("/mcp", async (req, res) => {
    // Verify JWT authentication
    const authResult = await verifyAuth(req.headers.authorization);
    if (!authResult.success) {
      res.status(401).json({ error: authResult.error });
      return;
    }

    const authContext: ExecutionContext = {
      userId: authResult.context.userId,
      workspaceId: authResult.context.workspaceId,
    };

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      // Existing session - verify same user
      const existingContext = sessionContextMap.get(sessionId);
      if (existingContext && existingContext.userId !== authContext.userId) {
        res.status(403).json({ error: "Session belongs to different user" });
        return;
      }
      transport = transports.get(sessionId)!;
    } else if (req.method === "POST" && !sessionId) {
      // New session
      const newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });

      const server = await createServer(newSessionId);
      await server.connect(transport);

      // Store auth context for this session
      sessionContextMap.set(newSessionId, authContext);
      transports.set(newSessionId, transport);

      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
          sessionContextMap.delete(transport.sessionId);
        }
      };

      console.error(
        `New MCP session: ${newSessionId} for user ${authContext.userId} in workspace ${authContext.workspaceId}`,
      );
    } else {
      res.status(400).json({ error: "Invalid session" });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.listen(port, "0.0.0.0", () => {
    console.error(`holoplax MCP server started (http) on port ${port}`);
  });
}

export async function startServer(): Promise<void> {
  const config = getConfig();

  if (config.transport === "http") {
    await startHttpServer();
  } else {
    await startStdioServer();
  }
}
