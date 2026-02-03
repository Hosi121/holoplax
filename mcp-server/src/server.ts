import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import express from "express";
import { getConfig, validateConfig } from "./config.js";
import { getToolByName, listToolDefinitions } from "./tools/index.js";

export async function createServer(): Promise<Server> {
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
      const result = await tool.handler(args ?? {});
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
  const apiKey = config.apiKey;

  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Session management
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // MCP endpoint
  app.all("/mcp", async (req, res) => {
    // API key authentication
    if (apiKey) {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (req.method === "POST" && !sessionId) {
      // New session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      const server = await createServer();
      await server.connect(transport);

      if (transport.sessionId) {
        transports.set(transport.sessionId, transport);
        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };
      }
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
