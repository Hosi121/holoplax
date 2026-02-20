import { randomBytes } from "crypto";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { getBaseUrl } from "../../../../lib/base-url";
import { AuthRequestResetSchema } from "../../../../lib/contracts/auth";
import { parseBody } from "../../../../lib/http/validation";
import { sendEmail } from "../../../../lib/mailer";
import prisma from "../../../../lib/prisma";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/auth/request-reset",
      errorFallback: {
        code: "AUTH_INTERNAL",
        message: "failed to request reset",
        status: 500,
      },
    },
    async () => {
      const body = await parseBody(request, AuthRequestResetSchema, { code: "AUTH_VALIDATION" });
      const email = body.email;

      // Enforce a constant minimum response time so that the presence or
      // absence of the email cannot be inferred from response latency
      // (CWE-208 timing oracle / user enumeration).
      const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 500));

      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        const token = randomBytes(32).toString("hex");
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + 1000 * 60 * 30),
          },
        });

        const baseUrl = getBaseUrl();
        const resetUrl = `${baseUrl}/auth/reset?token=${token}`;
        await logAudit({
          actorId: user.id,
          action: "AUTH_RESET_REQUESTED",
          metadata: { expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString() },
        });
        try {
          await sendEmail({
            to: user.email ?? email,
            subject: "Holoplax パスワード再設定",
            html: `<p>以下のリンクからパスワードを再設定してください。</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
          });
        } catch (emailErr) {
          console.error("[request-reset] failed to send reset email:", emailErr);
        }
      }

      await minDelay;
      return ok({ ok: true });
    },
  );
}
