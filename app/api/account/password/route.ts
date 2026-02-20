import { compare, hash } from "bcryptjs";
import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AccountPasswordChangeSchema } from "../../../../lib/contracts/auth";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("ACCOUNT");

/**
 * PATCH /api/account/password
 *
 * Allows an authenticated user who originally registered with a password to
 * change that password. OAuth-only users (no UserPassword record) receive a
 * 400 explaining that no password is set.
 *
 * Body: { currentPassword: string, newPassword: string }
 *
 * Security notes:
 * - The current password is verified via bcrypt.compare before any write.
 * - The new password is rejected if it equals the current one (Zod refine).
 * - Existing JWT sessions remain valid after the change (NextAuth JWT strategy
 *   has no server-side session store to invalidate). For higher security,
 *   users should sign out of other devices after changing their password.
 */
export async function PATCH(request: Request) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/account/password",
      errorFallback: {
        code: "ACCOUNT_INTERNAL",
        message: "failed to change password",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();

      const body = await parseBody(request, AccountPasswordChangeSchema, {
        code: "ACCOUNT_VALIDATION",
      });

      // Look up the stored password hash. OAuth-only accounts have no record.
      const userPassword = await prisma.userPassword.findUnique({
        where: { userId },
        select: { hash: true },
      });

      if (!userPassword) {
        return errors.badRequest(
          "this account has no password — sign in with your OAuth provider instead",
        );
      }

      // Verify current password before accepting the new one.
      const valid = await compare(body.currentPassword, userPassword.hash);
      if (!valid) {
        return errors.badRequest("current password is incorrect");
      }

      // Persist the new hash. bcrypt work factor 12 — slightly higher than the
      // registration default of 10 to make offline cracking more expensive.
      const newHash = await hash(body.newPassword, 12);
      await prisma.userPassword.update({
        where: { userId },
        data: { hash: newHash },
      });

      // Audit trail — password changes are security-sensitive events.
      await logAudit({
        actorId: userId,
        action: "ACCOUNT_PASSWORD_CHANGE",
        targetUserId: userId,
      });

      return ok({ ok: true });
    },
  );
}
