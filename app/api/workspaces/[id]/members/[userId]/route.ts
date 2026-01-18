import { requireAuth } from "../../../../../../lib/api-auth";
import { withApiHandler } from "../../../../../../lib/api-handler";
import { requireWorkspaceManager } from "../../../../../../lib/api-guards";
import { ok } from "../../../../../../lib/api-response";
import { logAudit } from "../../../../../../lib/audit";
import { WorkspaceMemberRoleUpdateSchema } from "../../../../../../lib/contracts/workspace";
import { parseBody } from "../../../../../../lib/http/validation";
import prisma from "../../../../../../lib/prisma";


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
      await requireWorkspaceManager("WORKSPACE", id, userId);
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
