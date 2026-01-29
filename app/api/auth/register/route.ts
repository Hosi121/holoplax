import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AuthRegisterSchema } from "../../../../lib/contracts/auth";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { logger } from "../../../../lib/logger";
import { sendEmail } from "../../../../lib/mailer";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("AUTH");

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/auth/register",
      errorFallback: {
        code: "AUTH_INTERNAL",
        message: "failed to register",
        status: 500,
      },
    },
    async () => {
      const body = await parseBody(request, AuthRegisterSchema, { code: "AUTH_VALIDATION" });
      const email = body.email;
      const password = body.password;
      const name = String(body.name ?? "").trim();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return errors.conflict("email already registered");
      }

      const hashed = await hash(password, 10);
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
      // ローカル（localhost）ではメール認証を自動スキップ。強制したい場合は EMAIL_VERIFY_ALWAYS=true を設定。
      const forceVerify = process.env.EMAIL_VERIFY_ALWAYS === "true";
      const hasEmailConfig = Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);
      const shouldVerify = forceVerify || (!isLocal && hasEmailConfig);
      const user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          emailVerified: shouldVerify ? null : new Date(),
          password: {
            create: { hash: hashed },
          },
        },
      });

      if (shouldVerify) {
        try {
          const token = randomBytes(32).toString("hex");
          await prisma.emailVerificationToken.create({
            data: {
              userId: user.id,
              token,
              expiresAt: new Date(Date.now() + 1000 * 60 * 60),
            },
          });
          const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
          const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;
          await sendEmail({
            to: user.email ?? email,
            subject: "Holoplax メール認証",
            html: `<p>以下のリンクからメール認証を完了してください。</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
          });
        } catch (mailError) {
          logger.error("Email verification send failed", {}, mailError);
        }
      }

      return ok({ id: user.id, email: user.email });
    },
  );
}
