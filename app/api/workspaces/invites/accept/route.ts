import { requireAuth } from "../../../../../lib/api-auth";
import { badRequest, handleAuthError, ok, serverError } from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import prisma from "../../../../../lib/prisma";

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const token = String(body.token ?? "").trim();
    if (!token) return badRequest("token is required");

    const invite = await prisma.workspaceInvite.findUnique({ where: { token } });
    if (!invite || invite.expiresAt < new Date()) {
      return badRequest("invite is invalid or expired");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return badRequest("invite email mismatch");
    }

    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
      update: { role: invite.role },
      create: { workspaceId: invite.workspaceId, userId, role: invite.role },
    });
    await prisma.workspaceInvite.update({
      where: { token },
      data: { acceptedAt: new Date() },
    });

    await logAudit({
      actorId: userId,
      action: "WORKSPACE_INVITE_ACCEPT",
      targetWorkspaceId: invite.workspaceId,
      metadata: { email: invite.email, role: invite.role },
    });

    return ok({ ok: true });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/workspaces/invites/accept error", error);
    return serverError("failed to accept invite");
  }
}
