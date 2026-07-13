import { requireAuth } from "../../../../../../lib/api-auth";
import { requireWorkspaceManager } from "../../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../../lib/api-handler";
import { ok } from "../../../../../../lib/api-response";
import { logAudit } from "../../../../../../lib/audit";
import { WorkspaceMemberRoleUpdateSchema } from "../../../../../../lib/contracts/workspace";
import { createDomainErrors } from "../../../../../../lib/http/errors";
import { parseBody } from "../../../../../../lib/http/validation";
import prisma from "../../../../../../lib/prisma";

const errors = createDomainErrors("WORKSPACE");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/workspaces/[id]/members/[userId]",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to update member",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const { id, userId: targetUserId } = await params;
      await requireWorkspaceManager("WORKSPACE", id, userId);
      const body = await parseBody(request, WorkspaceMemberRoleUpdateSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const role = body.role;

      const [target, workspace] = await Promise.all([
        prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: id, userId: targetUserId } },
          select: { role: true },
        }),
        prisma.workspace.findUnique({ where: { id }, select: { ownerId: true } }),
      ]);
      if (!target) {
        return errors.notFound("member not found");
      }
      if (!workspace) return errors.notFound("workspace not found");

      if (role === "owner") {
        if (workspace.ownerId !== userId) {
          return errors.forbidden("only the current workspace owner can transfer ownership");
        }
        const updated = await prisma.$transaction(async (tx) => {
          await tx.workspace.update({ where: { id }, data: { ownerId: targetUserId } });
          await tx.workspaceMember.updateMany({
            where: { workspaceId: id, role: "owner", userId: { not: targetUserId } },
            data: { role: "admin" },
          });
          return tx.workspaceMember.update({
            where: { workspaceId_userId: { workspaceId: id, userId: targetUserId } },
            data: { role: "owner" },
            select: { userId: true, workspaceId: true, role: true },
          });
        });
        await logAudit({
          actorId: userId,
          action: "WORKSPACE_OWNERSHIP_TRANSFER",
          targetWorkspaceId: id,
          targetUserId,
          metadata: { previousOwnerId: workspace.ownerId },
        });
        return ok({ member: updated });
      }

      if (workspace.ownerId === targetUserId) {
        return errors.conflict("transfer ownership before changing the owner's role");
      }
      if (target.role === "owner" && workspace.ownerId !== userId) {
        return errors.forbidden("only the current workspace owner can change an owner role");
      }

      const updated = await prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: id, userId: targetUserId } },
        data: { role },
        select: { userId: true, workspaceId: true, role: true },
      });
      await logAudit({
        actorId: userId,
        action: "WORKSPACE_MEMBER_ROLE_UPDATE",
        targetWorkspaceId: id,
        targetUserId,
        metadata: { role },
      });
      return ok({ member: updated });
    },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  return withApiHandler(
    {
      logLabel: "DELETE /api/workspaces/[id]/members/[userId]",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to remove member",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const { id, userId: targetUserId } = await params;
      await requireWorkspaceManager("WORKSPACE", id, userId);

      const [target, workspace] = await Promise.all([
        prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: id, userId: targetUserId } },
          select: { role: true },
        }),
        prisma.workspace.findUnique({ where: { id }, select: { ownerId: true } }),
      ]);
      if (!target) {
        return errors.notFound("member not found");
      }

      if (workspace?.ownerId === targetUserId) {
        return errors.conflict("transfer ownership before removing the owner");
      }

      await prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: id, userId: targetUserId } },
      });
      await logAudit({
        actorId: userId,
        action: "WORKSPACE_MEMBER_REMOVE",
        targetWorkspaceId: id,
        targetUserId,
      });
      return ok({ ok: true });
    },
  );
}
