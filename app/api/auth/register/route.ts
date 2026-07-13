import { hash } from "bcryptjs";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { sendVerificationEmail } from "../../../../lib/auth-verification";
import { getBaseUrl } from "../../../../lib/base-url";
import { AuthRegisterSchema } from "../../../../lib/contracts/auth";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { logger } from "../../../../lib/logger";
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
      const baseUrl = getBaseUrl();
      const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
      // ローカル（localhost）ではメール認証を自動スキップ。強制したい場合は EMAIL_VERIFY_ALWAYS=true を設定。
      const forceVerify = process.env.EMAIL_VERIFY_ALWAYS === "true";
      const hasEmailConfig = Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);
      // Fail closed: in a non-local deployment without email configured we must
      // NOT silently auto-verify (that would let anyone register with an email
      // they don't own and log in). Refuse registration instead.
      if (!isLocal && !hasEmailConfig && !forceVerify) {
        return errors.internal("registration is temporarily unavailable: email is not configured");
      }
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

      let verificationEmailSent = false;
      if (shouldVerify) {
        try {
          await sendVerificationEmail({
            userId: user.id,
            email: user.email ?? email,
            callbackUrl: body.callbackUrl,
          });
          verificationEmailSent = true;
        } catch (mailError) {
          logger.error("Email verification send failed", {}, mailError);
        }
      }

      await logAudit({
        actorId: user.id,
        action: "AUTH_REGISTER",
        metadata: { requiresEmailVerification: shouldVerify },
      });
      return ok({
        id: user.id,
        email: user.email,
        requiresEmailVerification: shouldVerify,
        verificationEmailSent,
      });
    },
  );
}
