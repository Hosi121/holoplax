import { requireAuth } from "../../../../../lib/api-auth";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import { WorkspaceInviteAcceptSchema } from "../../../../../lib/contracts/workspace";
import { createDomainErrors } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import prisma from "../../../../../lib/prisma";

const errors = createDomainErrors("WORKSPACE");

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/workspaces/invites/accept",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to accept invite",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, WorkspaceInviteAcceptSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const token = body.token;

      const invite = await prisma.workspaceInvite.findUnique({ where: { token } });
      if (!invite || invite.expiresAt < new Date()) {
        return errors.badRequest("invite is invalid or expired");
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.email || user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return errors.badRequest("invite email mismatch");
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
    },
  );
}
