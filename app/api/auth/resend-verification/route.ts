import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { sendVerificationEmail } from "../../../../lib/auth-verification";
import { AuthResendVerificationSchema } from "../../../../lib/contracts/auth";
import { parseBody } from "../../../../lib/http/validation";
import { logger } from "../../../../lib/logger";
import prisma from "../../../../lib/prisma";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/auth/resend-verification",
      errorFallback: {
        code: "AUTH_INTERNAL",
        message: "failed to resend verification email",
        status: 500,
      },
    },
    async () => {
      const body = await parseBody(request, AuthResendVerificationSchema, {
        code: "AUTH_VALIDATION",
      });
      const user = await prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true, email: true, emailVerified: true, disabledAt: true },
      });

      // Always return the same response so this endpoint cannot enumerate users.
      if (user?.email && !user.emailVerified && !user.disabledAt) {
        try {
          await sendVerificationEmail({
            userId: user.id,
            email: user.email,
            callbackUrl: body.callbackUrl,
          });
        } catch (error) {
          logger.error("Email verification resend failed", {}, error);
        }
      }
      return ok({ ok: true });
    },
  );
}
