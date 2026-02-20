import type { WorkspaceRole } from "@prisma/client";
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

      // Validate the user's email before entering the transaction so we can
      // return a distinct error message without holding a DB lock.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      // Validate and consume the invite inside a serializable transaction.
      // This prevents two concurrent requests with the same token from both
      // succeeding (TOCTOU / double-acceptance attack).
      let invite: { workspaceId: string; email: string; role: WorkspaceRole } | null = null;

      try {
        invite = await prisma.$transaction(
          async (tx) => {
            const found = await tx.workspaceInvite.findUnique({ where: { token } });

            if (!found) return null;
            if (found.expiresAt < new Date()) return null;
            // Reject tokens that have already been consumed
            if (found.acceptedAt !== null) return null;

            if (!user?.email || user.email.toLowerCase() !== found.email.toLowerCase()) {
              // Throw a sentinel so we can distinguish email-mismatch from
              // invalid-token, without leaking information to other users.
              throw new Error("EMAIL_MISMATCH");
            }

            await tx.workspaceMember.upsert({
              where: {
                workspaceId_userId: { workspaceId: found.workspaceId, userId },
              },
              update: { role: found.role },
              create: {
                workspaceId: found.workspaceId,
                userId,
                role: found.role,
              },
            });

            // Mark the token as consumed atomically with the membership write.
            await tx.workspaceInvite.update({
              where: { token },
              data: { acceptedAt: new Date() },
            });

            return {
              workspaceId: found.workspaceId,
              email: found.email,
              role: found.role,
            };
          },
          { isolationLevel: "Serializable" },
        );
      } catch (err) {
        if (err instanceof Error && err.message === "EMAIL_MISMATCH") {
          return errors.badRequest("invite email mismatch");
        }
        throw err;
      }

      if (!invite) {
        return errors.badRequest("invite is invalid or expired");
      }

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
