import { requireAuth } from "../../../../../../lib/api-auth";
import {
  badRequest,
  forbidden,
  handleAuthError,
  ok,
  serverError,
} from "../../../../../../lib/api-response";
import { logAudit } from "../../../../../../lib/audit";
import prisma from "../../../../../../lib/prisma";

const canManage = async (workspaceId: string, userId: string) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return membership?.role === "owner" || membership?.role === "admin";
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { userId } = await requireAuth();
    const { id, userId: targetUserId } = await params;
    if (!(await canManage(id, userId))) return forbidden();
    const body = await request.json();
    const role = String(body.role ?? "").toLowerCase();
    if (!role) return badRequest("role is required");
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
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("PATCH /api/workspaces/[id]/members/[userId] error", error);
    return serverError("failed to update member");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { userId } = await requireAuth();
    const { id, userId: targetUserId } = await params;
    if (!(await canManage(id, userId))) return forbidden();
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
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("DELETE /api/workspaces/[id]/members/[userId] error", error);
    return serverError("failed to remove member");
  }
}
