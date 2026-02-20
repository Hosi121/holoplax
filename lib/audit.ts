import { Prisma } from "@prisma/client";
import prisma from "./prisma";

/**
 * Persist an audit-log entry.
 *
 * Failures are intentionally swallowed with a console.error so that an audit
 * DB write never converts a successful user-facing operation into a 500.
 * The primary operation has already committed by the time this is called, so
 * propagating the error would give the caller a false failure response.
 */
export async function logAudit(params: {
  actorId: string;
  action: string;
  targetUserId?: string;
  targetWorkspaceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        targetUserId: params.targetUserId ?? null,
        targetWorkspaceId: params.targetWorkspaceId ?? null,
        metadata: (params.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", {
      action: params.action,
      actorId: params.actorId,
      error: err,
    });
  }
}
