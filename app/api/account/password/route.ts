import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AccountPasswordChangeSchema } from "../../../../lib/contracts/auth";
import { parseBody } from "../../../../lib/http/validation";
import { changeAccountPassword } from "../../../../modules/identity/index.server";

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
 * - passwordChangedAt is stamped so requireAuth rejects JWTs issued before the
 *   change, evicting other sessions on the next authenticated request.
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

      await changeAccountPassword(userId, body.currentPassword, body.newPassword);
      return ok({ ok: true });
    },
  );
}
