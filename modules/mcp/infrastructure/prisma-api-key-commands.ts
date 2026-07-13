import { createHash, randomBytes } from "crypto";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { McpApiKeyPort } from "../application/api-key-commands";

const error = (code: string, message: string, kind: "forbidden" | "not_found") =>
  new ApplicationError(code, message, kind);

const generateApiKey = () => `mcp_${randomBytes(32).toString("base64url")}`;
const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

export const prismaMcpApiKeyPort: McpApiKeyPort = {
  list(userId) {
    return prisma.mcpApiKey.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        workspaceId: true,
        workspace: { select: { name: true } },
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },

  create(input) {
    return prisma.$transaction(async (tx) => {
      const membership = await tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId },
        },
        select: { userId: true },
      });
      if (!membership) throw error("MCP_KEYS_FORBIDDEN", "No access to workspace", "forbidden");
      const apiKey = generateApiKey();
      const keyPrefix = `${apiKey.slice(0, 12)}...`;
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;
      const keyRecord = await tx.mcpApiKey.create({
        data: {
          name: input.name,
          keyHash: hashApiKey(apiKey),
          keyPrefix,
          userId: input.userId,
          workspaceId: input.workspaceId,
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
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "MCP_KEY_CREATE",
          targetWorkspaceId: input.workspaceId,
          metadata: { keyId: keyRecord.id, keyPrefix, expiresAt: expiresAt?.toISOString() ?? null },
        },
      });
      return { key: apiKey, ...keyRecord };
    });
  },

  async revoke(userId, keyId) {
    await prisma.$transaction(async (tx) => {
      const key = await tx.mcpApiKey.findFirst({
        where: { id: keyId, userId, revokedAt: null },
        select: { id: true, workspaceId: true, keyPrefix: true },
      });
      if (!key) throw error("MCP_KEYS_NOT_FOUND", "Key not found", "not_found");
      await tx.mcpApiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "MCP_KEY_REVOKE",
          targetWorkspaceId: key.workspaceId,
          metadata: { keyId, keyPrefix: key.keyPrefix },
        },
      });
    });
  },
};
