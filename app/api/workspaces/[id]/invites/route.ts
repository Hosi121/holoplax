import { randomBytes } from "crypto";
import { requireAuth } from "../../../../../lib/api-auth";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import { WorkspaceInviteCreateSchema } from "../../../../../lib/contracts/workspace";
import { createDomainErrors } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import prisma from "../../../../../lib/prisma";

const canManage = async (workspaceId: string, userId: string) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return membership?.role === "owner" || membership?.role === "admin";
};

const errors = createDomainErrors("WORKSPACE");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiHandler(
    {
      logLabel: "POST /api/workspaces/[id]/invites",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to create invite",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const { id } = await params;
      if (!(await canManage(id, userId))) return errors.forbidden();
      const body = await parseBody(request, WorkspaceInviteCreateSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const email = body.email;
      const role = body.role ?? "member";

      const token = randomBytes(24).toString("hex");
      const invite = await prisma.workspaceInvite.create({
        data: {
          workspaceId: id,
          email,
          role,
          token,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        },
      });
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const inviteUrl = `${baseUrl}/workspaces/invite?token=${invite.token}`;

      await logAudit({
        actorId: userId,
        action: "WORKSPACE_INVITE_CREATE",
        targetWorkspaceId: id,
        metadata: { email, role },
      });

      return ok({ inviteUrl, invite });
    },
  );
}
