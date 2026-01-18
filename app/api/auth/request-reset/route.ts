import { randomBytes } from "crypto";
import { ok } from "../../../../lib/api-response";
import { AuthRequestResetSchema } from "../../../../lib/contracts/auth";
import { errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { sendEmail } from "../../../../lib/mailer";
import prisma from "../../../../lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, AuthRequestResetSchema, { code: "AUTH_VALIDATION" });
    const email = body.email;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return ok({ ok: true });
    }

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/auth/reset?token=${token}`;
    await sendEmail({
      to: user.email ?? email,
      subject: "Holoplax パスワード再設定",
      html: `<p>以下のリンクからパスワードを再設定してください。</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });

    return ok({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/request-reset error", error);
    return errorResponse(error, {
      code: "AUTH_INTERNAL",
      message: "failed to request reset",
      status: 500,
    });
  }
}
