/**
 * JWT authentication for MCP server
 * Verifies NextAuth.js JWT tokens
 */

import { PrismaClient } from "@prisma/client";
import { jwtDecrypt } from "jose";

const prisma = new PrismaClient();

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
 * Verify JWT token from Authorization header and resolve workspace
 */
export async function verifyAuth(authHeader: string | undefined): Promise<AuthResponse> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return { success: false, error: "NEXTAUTH_SECRET not configured" };
  }

  if (!authHeader) {
    return { success: false, error: "Authorization header required" };
  }

  // Support "Bearer <token>" format
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!token) {
    return { success: false, error: "Token not provided" };
  }

  try {
    // Decode NextAuth.js encrypted JWT
    const encryptionKey = await getDerivedEncryptionKey(secret);
    const { payload } = await jwtDecrypt(token, encryptionKey, {
      clockTolerance: 15, // 15 seconds tolerance
    });

    const userId = payload.sub;
    if (!userId || typeof userId !== "string") {
      return { success: false, error: "Invalid token: missing user ID" };
    }

    // Check if user exists and is not disabled
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

    // Resolve workspace: from token payload or first membership
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

    // Verify user has access to the workspace
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
      // Common JWT errors
      if (error.message.includes("JWE")) {
        return { success: false, error: "Invalid token format" };
      }
      if (error.message.includes("expired")) {
        return { success: false, error: "Token expired" };
      }
    }
    console.error("Auth error:", error);
    return { success: false, error: "Authentication failed" };
  }
}
