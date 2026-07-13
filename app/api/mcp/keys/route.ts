import { requireWorkspaceAuth } from "@/lib/api-guards";
import { withApiHandler } from "@/lib/api-handler";
import { ok } from "@/lib/api-response";
import { McpKeyCreateSchema } from "@/lib/contracts/mcp";
import { AppError } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/validation";
import { createMcpApiKey, listMcpApiKeys, revokeMcpApiKey } from "@/modules/mcp/index.server";

// GET /api/mcp/keys - List all API keys for current user
export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/mcp/keys",
      errorFallback: {
        code: "MCP_KEYS_INTERNAL",
        message: "failed to list API keys",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireWorkspaceAuth({ requireWorkspace: true });

      return ok({ keys: await listMcpApiKeys(userId) });
    },
  );
}

// POST /api/mcp/keys - Create a new API key
export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/mcp/keys",
      errorFallback: {
        code: "MCP_KEYS_INTERNAL",
        message: "failed to create API key",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireWorkspaceAuth({ requireWorkspace: true });

      const { name, workspaceId, expiresInDays } = await parseBody(request, McpKeyCreateSchema, {
        code: "MCP_KEYS_BAD_REQUEST",
      });

      return ok(await createMcpApiKey({ userId, name, workspaceId, expiresInDays }));
    },
  );
}

// DELETE /api/mcp/keys - Revoke an API key
export async function DELETE(request: Request) {
  return withApiHandler(
    {
      logLabel: "DELETE /api/mcp/keys",
      errorFallback: {
        code: "MCP_KEYS_INTERNAL",
        message: "failed to revoke API key",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireWorkspaceAuth({ requireWorkspace: true });

      const { searchParams } = new URL(request.url);
      const keyId = searchParams.get("id")?.trim();

      if (!keyId) {
        throw new AppError("MCP_KEYS_BAD_REQUEST", "Key ID is required", 400);
      }

      await revokeMcpApiKey(userId, keyId);
      return ok({ success: true });
    },
  );
}
