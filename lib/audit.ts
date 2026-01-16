import prisma from "./prisma";

export async function logAudit(params: {
  actorId: string;
  action: string;
  targetUserId?: string;
  targetWorkspaceId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetUserId: params.targetUserId ?? null,
      targetWorkspaceId: params.targetWorkspaceId ?? null,
      metadata: params.metadata ?? undefined,
    },
  });
}
