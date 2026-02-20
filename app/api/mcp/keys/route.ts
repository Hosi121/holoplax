import { createHash, randomBytes } from "crypto";
import { requireWorkspaceAuth } from "@/lib/api-guards";
import { withApiHandler } from "@/lib/api-handler";
import { ok } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { McpKeyCreateSchema } from "@/lib/contracts/mcp";
import { AppError } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/validation";
import prisma from "@/lib/prisma";

// Generate a secure API key
function generateApiKey(): string {
  const bytes = randomBytes(32);
  return `mcp_${bytes.toString("base64url")}`;
}

// Hash the API key for storage
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

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

      const now = new Date();
      const keys = await prisma.mcpApiKey.findMany({
        where: {
          userId,
          revokedAt: null,
          // Exclude keys that have an explicit expiry in the past.
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          workspaceId: true,
          workspace: {
            select: {
              name: true,
            },
          },
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      });

      return ok({ keys });
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

      // Verify user has access to the workspace
      const membership = await prisma.workspaceMember.findFirst({
        where: {
          userId,
          workspaceId,
        },
      });

      if (!membership) {
        throw new AppError("MCP_KEYS_FORBIDDEN", "No access to workspace", 403);
      }

      // Generate key
      const apiKey = generateApiKey();
      const keyHash = hashApiKey(apiKey);
      const keyPrefix = apiKey.slice(0, 12) + "...";

      // Calculate expiration
      let expiresAt: Date | null = null;
      if (expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }

      // Create key record
      const keyRecord = await prisma.mcpApiKey.create({
        data: {
          name,
          keyHash,
          keyPrefix,
          userId,
          workspaceId,
          expiresAt,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          workspaceId: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      await logAudit({
        actorId: userId,
        action: "MCP_KEY_CREATE",
        targetWorkspaceId: workspaceId,
        metadata: { keyId: keyRecord.id, keyPrefix, expiresAt: expiresAt?.toISOString() ?? null },
      });
      // Return the full key only once (it cannot be retrieved later)
      return ok({
        key: apiKey,
        ...keyRecord,
      });
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

      // Verify ownership
      const key = await prisma.mcpApiKey.findFirst({
        where: {
          id: keyId,
          userId,
        },
      });

      if (!key) {
        throw new AppError("MCP_KEYS_NOT_FOUND", "Key not found", 404);
      }

      // Revoke the key
      await prisma.mcpApiKey.update({
        where: { id: keyId },
        data: { revokedAt: new Date() },
      });

      await logAudit({
        actorId: userId,
        action: "MCP_KEY_REVOKE",
        metadata: { keyId, keyPrefix: key.keyPrefix },
      });
      return ok({ success: true });
    },
  );
}
