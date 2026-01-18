import { ok } from "../../../../lib/api-response";
import { AuthVerifySchema } from "../../../../lib/contracts/auth";
import { createDomainErrors, errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("AUTH");

export async function POST(request: Request) {
  try {
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
  } catch (error) {
    console.error("POST /api/auth/verify error", error);
    return errorResponse(error, {
      code: "AUTH_INTERNAL",
      message: "failed to verify email",
      status: 500,
    });
  }
}
