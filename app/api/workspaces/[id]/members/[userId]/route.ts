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
      const callerMembership = await requireWorkspaceManager("WORKSPACE", id, userId);
      const body = await parseBody(request, WorkspaceMemberRoleUpdateSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const role = body.role;

      // Only an owner may grant the owner role.
      if (role === "owner" && callerMembership?.role !== "owner") {
        return errors.forbidden("only the workspace owner can assign the owner role");
      }

      const target = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: id, userId: targetUserId } },
        select: { role: true },
      });
      if (!target) {
        return errors.notFound("member not found");
      }

      // Prevent demoting the last remaining owner (which would orphan the
      // workspace with no owner).
      if (target.role === "owner" && role !== "owner") {
        const ownerCount = await prisma.workspaceMember.count({
          where: { workspaceId: id, role: "owner" },
        });
        if (ownerCount <= 1) {
          return errors.conflict("cannot demote the last remaining owner");
        }
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

      const target = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: id, userId: targetUserId } },
        select: { role: true },
      });
      if (!target) {
        return errors.notFound("member not found");
      }

      // Prevent removing the last remaining owner.
      if (target.role === "owner") {
        const ownerCount = await prisma.workspaceMember.count({
          where: { workspaceId: id, role: "owner" },
        });
        if (ownerCount <= 1) {
          return errors.conflict("cannot remove the last remaining owner");
        }
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
