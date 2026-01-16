import { hash } from "bcryptjs";
import { badRequest, ok, serverError } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");
    if (!token || !password) {
      return badRequest("token and password are required");
    }
    if (password.length < 8) {
      return badRequest("password must be at least 8 characters");
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return badRequest("token is invalid or expired");
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
    return serverError("failed to reset password");
  }
}
