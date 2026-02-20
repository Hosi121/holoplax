/**
 * Authentication for MCP server
 * Supports both API keys (mcp_*) and NextAuth.js JWT tokens
 */

import { createHash } from "crypto";
import { jwtDecrypt } from "jose";
import prisma from "./prisma.js";

// NextAuth.js uses HKDF to derive encryption key
async function getDerivedEncryptionKey(secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HKDF" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(""),
      info: encoder.encode("NextAuth.js Generated Encryption Key"),
    },
    keyMaterial,
    256,
  );

  return new Uint8Array(derivedBits);
}

export interface AuthContext {
  userId: string;
  workspaceId: string;
  email?: string;
  name?: string;
}

export interface AuthResult {
  success: true;
  context: AuthContext;
}

export interface AuthError {
  success: false;
  error: string;
}

export type AuthResponse = AuthResult | AuthError;

/**
 * Hash an API key for comparison
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Verify API key (mcp_* format)
 */
async function verifyApiKey(apiKey: string): Promise<AuthResponse> {
  const keyHash = hashApiKey(apiKey);

  const keyRecord = await prisma.mcpApiKey.findUnique({
    where: { keyHash },
    include: {
      user: {
        select: { id: true, email: true, name: true, disabledAt: true },
      },
    },
  });

  if (!keyRecord) {
    return { success: false, error: "Invalid API key" };
  }

  if (keyRecord.revokedAt) {
    return { success: false, error: "API key has been revoked" };
  }

  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return { success: false, error: "API key has expired" };
  }

  if (keyRecord.user.disabledAt) {
    return { success: false, error: "User account is disabled" };
  }

  // Update last used timestamp (fire and forget)
  prisma.mcpApiKey
    .update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // Ignore errors
    });

  return {
    success: true,
    context: {
      userId: keyRecord.userId,
      workspaceId: keyRecord.workspaceId,
      email: keyRecord.user.email ?? undefined,
      name: keyRecord.user.name ?? undefined,
    },
  };
}

/**
 * Verify NextAuth.js JWT token (legacy support)
 */
async function verifyJwtToken(token: string): Promise<AuthResponse> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return { success: false, error: "NEXTAUTH_SECRET not configured" };
  }

  try {
    const encryptionKey = await getDerivedEncryptionKey(secret);
    const { payload } = await jwtDecrypt(token, encryptionKey, {
      clockTolerance: 15,
    });

    const userId = payload.sub;
    if (!userId || typeof userId !== "string") {
      return { success: false, error: "Invalid token: missing user ID" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, disabledAt: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (user.disabledAt) {
      return { success: false, error: "User account is disabled" };
    }

    // Resolve workspace
    let workspaceId: string | undefined;
    if (payload.workspaceId && typeof payload.workspaceId === "string") {
      workspaceId = payload.workspaceId;
    }

    let resolvedWorkspaceId: string;
    if (workspaceId) {
      resolvedWorkspaceId = workspaceId;
    } else {
      const membership = await prisma.workspaceMember.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { workspaceId: true },
      });

      if (!membership) {
        return { success: false, error: "User has no workspace membership" };
      }

      resolvedWorkspaceId = membership.workspaceId;
    }

    const hasAccess = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: resolvedWorkspaceId },
    });

    if (!hasAccess) {
      return { success: false, error: "No access to workspace" };
    }

    return {
      success: true,
      context: {
        userId,
        workspaceId: resolvedWorkspaceId,
        email: user.email ?? undefined,
        name: user.name ?? undefined,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("JWE")) {
        return { success: false, error: "Invalid token format" };
      }
      if (error.message.includes("expired")) {
        return { success: false, error: "Token expired" };
      }
    }
    console.error("JWT auth error:", error);
    return { success: false, error: "Authentication failed" };
  }
}

/**
 * Verify authentication from Authorization header
 * Supports:
 * - API keys: "Bearer mcp_..."
 * - JWT tokens: "Bearer eyJ..." (legacy)
 */
export async function verifyAuth(authHeader: string | undefined): Promise<AuthResponse> {
  if (!authHeader) {
    return { success: false, error: "Authorization header required" };
  }

  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!token) {
    return { success: false, error: "Token not provided" };
  }

  // Check if it's an API key (mcp_* format)
  if (token.startsWith("mcp_")) {
    return verifyApiKey(token);
  }

  // Otherwise try JWT token (legacy)
  return verifyJwtToken(token);
}
