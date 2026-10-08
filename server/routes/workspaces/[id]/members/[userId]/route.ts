import { requireAuth } from "../../../../../../lib/api-auth";
import { requireWorkspaceManager } from "../../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../../lib/api-handler";
import { ok } from "../../../../../../lib/api-response";
import { WorkspaceMemberRoleUpdateSchema } from "../../../../../../lib/contracts/workspace";
import { parseBody } from "../../../../../../lib/http/validation";
import {
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "../../../../../../modules/workspaces/index.server";

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
      const member = await updateWorkspaceMemberRole(
        { actorId: userId, workspaceId: id, targetUserId },
        body.role,
      );
      return ok({ member });
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

      await removeWorkspaceMember({
        actorId: userId,
        workspaceId: id,
        targetUserId,
      });
      return ok({ ok: true });
    },
  );
}
