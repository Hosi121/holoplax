import { randomBytes } from "crypto";
import { requireAuth } from "../../../../../lib/api-auth";
import { requireWorkspaceManager } from "../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import { getBaseUrl } from "../../../../../lib/base-url";
import { WorkspaceInviteCreateSchema } from "../../../../../lib/contracts/workspace";
import { escapeHtml } from "../../../../../lib/html-escape";
import { parseBody } from "../../../../../lib/http/validation";
import { sendEmail } from "../../../../../lib/mailer";
import prisma from "../../../../../lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      await requireWorkspaceManager("WORKSPACE", id, userId);
      const body = await parseBody(request, WorkspaceInviteCreateSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const email = body.email;
      const role = body.role ?? "member";

      // Fetch workspace name for the email subject / body
      const workspace = await prisma.workspace.findUnique({
        where: { id },
        select: { name: true },
      });

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
      const baseUrl = getBaseUrl();
      const inviteUrl = `${baseUrl}/workspaces/invite?token=${invite.token}`;

      // Send invite email. Failure is non-fatal — the invite record is already
      // persisted and the caller can share the URL manually.
      const workspaceName = escapeHtml(workspace?.name ?? "a workspace");
      const safeRole = escapeHtml(role);
      try {
        await sendEmail({
          to: email,
          subject: `Holoplax: ${workspaceName} へ招待されました`,
          html: [
            `<p>あなたは <strong>${workspaceName}</strong> に <strong>${safeRole}</strong> として招待されました。</p>`,
            `<p>以下のリンクから参加できます（有効期限：7日間）：</p>`,
            `<p><a href="${inviteUrl}">${inviteUrl}</a></p>`,
          ].join("\n"),
        });
      } catch (emailErr) {
        // Log but don't fail — invite is created; sender can share the URL
        console.error("[invites] failed to send invite email:", emailErr);
      }

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
