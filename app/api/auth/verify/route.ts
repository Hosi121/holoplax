import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
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
      const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
      if (!record || record.expiresAt < new Date()) {
        return errors.badRequest("token is invalid or expired");
      }
      await prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: new Date() },
      });
      await prisma.emailVerificationToken.delete({ where: { token } });
      return ok({ ok: true });
    },
  );
}
