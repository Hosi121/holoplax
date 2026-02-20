import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AuthVerifySchema } from "../../../../lib/contracts/auth";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("AUTH");

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/auth/verify",
      errorFallback: {
        code: "AUTH_INTERNAL",
        message: "failed to verify email",
        status: 500,
      },
    },
    async () => {
      const body = await parseBody(request, AuthVerifySchema, { code: "AUTH_VALIDATION" });
      const token = body.token;

      // Validate and consume the token atomically to prevent two concurrent
      // requests from both succeeding with the same token (TOCTOU race).
      const userId = await prisma.$transaction(
        async (tx) => {
          const record = await tx.emailVerificationToken.findUnique({ where: { token } });
          if (!record || record.expiresAt < new Date()) return null;

          await tx.user.update({
            where: { id: record.userId },
            data: { emailVerified: new Date() },
          });
          await tx.emailVerificationToken.delete({ where: { token } });
          return record.userId;
        },
        { isolationLevel: "Serializable" },
      );

      if (!userId) {
        return errors.badRequest("token is invalid or expired");
      }

      await logAudit({
        actorId: userId,
        action: "AUTH_EMAIL_VERIFIED",
        metadata: { via: "verification_token" },
      });
      return ok({ ok: true });
    },
  );
}
