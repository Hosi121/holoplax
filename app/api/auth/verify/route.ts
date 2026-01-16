import prisma from "../../../../lib/prisma";
import { badRequest, ok, serverError } from "../../../../lib/api-response";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "").trim();
    if (!token) {
      return badRequest("token is required");
    }
    const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
    if (!record || record.expiresAt < new Date()) {
      return badRequest("token is invalid or expired");
    }
    await prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    });
    await prisma.emailVerificationToken.delete({ where: { token } });
    return ok({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/verify error", error);
    return serverError("failed to verify email");
  }
}
