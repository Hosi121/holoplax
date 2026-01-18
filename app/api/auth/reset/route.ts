import { hash } from "bcryptjs";
import { ok } from "../../../../lib/api-response";
import { AuthResetSchema } from "../../../../lib/contracts/auth";
import { createDomainErrors, errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("AUTH");

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, AuthResetSchema, { code: "AUTH_VALIDATION" });
    const token = body.token;
    const password = body.password;

    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return errors.badRequest("token is invalid or expired");
    }

    const hashed = await hash(password, 10);
    await prisma.userPassword.upsert({
      where: { userId: record.userId },
      update: { hash: hashed },
      create: { userId: record.userId, hash: hashed },
    });
    await prisma.passwordResetToken.update({
      where: { token },
      data: { used: true },
    });
    return ok({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/reset error", error);
    return errorResponse(error, {
      code: "AUTH_INTERNAL",
      message: "failed to reset password",
      status: 500,
    });
  }
}
