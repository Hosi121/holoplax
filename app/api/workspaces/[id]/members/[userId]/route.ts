import { requireAuth } from "../../../../../../lib/api-auth";
import { withApiHandler } from "../../../../../../lib/api-handler";
import { ok } from "../../../../../../lib/api-response";
import { logAudit } from "../../../../../../lib/audit";
import { WorkspaceMemberRoleUpdateSchema } from "../../../../../../lib/contracts/workspace";
import { createDomainErrors } from "../../../../../../lib/http/errors";
import { parseBody } from "../../../../../../lib/http/validation";
import prisma from "../../../../../../lib/prisma";

const canManage = async (workspaceId: string, userId: string) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return membership?.role === "owner" || membership?.role === "admin";
};

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
      if (!(await canManage(id, userId))) return errors.forbidden();
      const body = await parseBody(request, WorkspaceMemberRoleUpdateSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const role = body.role;
      const updated = await prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: id, userId: targetUserId } },
        data: { role },
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
      if (!(await canManage(id, userId))) return errors.forbidden();
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
