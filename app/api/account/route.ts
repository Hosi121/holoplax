import { randomBytes } from "crypto";
import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { logAudit } from "../../../lib/audit";
import { getBaseUrl } from "../../../lib/base-url";
import { AccountUpdateSchema } from "../../../lib/contracts/auth";
import { createDomainErrors } from "../../../lib/http/errors";
import { parseBody } from "../../../lib/http/validation";
import { logger } from "../../../lib/logger";
import { sendEmail } from "../../../lib/mailer";
import prisma from "../../../lib/prisma";

const errors = createDomainErrors("ACCOUNT");

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/account",
      errorFallback: {
        code: "ACCOUNT_INTERNAL",
        message: "failed to load account",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          accounts: {
            select: {
              provider: true,
              providerAccountId: true,
            },
          },
        },
      });
      const linkedProviders = user?.accounts.map((a) => a.provider) ?? [];
      return ok({ user, linkedProviders });
    },
  );
}

export async function PATCH(request: Request) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/account",
      errorFallback: {
        code: "ACCOUNT_INTERNAL",
        message: "failed to update account",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, AccountUpdateSchema, {
        code: "ACCOUNT_VALIDATION",
      });
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "")
        .toLowerCase()
        .trim();
      const image = String(body.image ?? "").trim();

      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      const emailChanged = Boolean(email) && email !== (current?.email ?? "").toLowerCase();

      if (email) {
        const existing = await prisma.user.findFirst({
          where: { email, NOT: { id: userId } },
        });
        if (existing) {
          return errors.conflict("email already in use");
        }
      }

      // When the login email changes we must re-verify ownership of the new
      // address. In environments where email can actually be sent we reset
      // emailVerified and send a verification link; otherwise (local / no email
      // config) we fall back to auto-verifying, mirroring registration.
      const baseUrl = getBaseUrl();
      const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
      const forceVerify = process.env.EMAIL_VERIFY_ALWAYS === "true";
      const hasEmailConfig = Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);
      const shouldReverify = emailChanged && (forceVerify || (!isLocal && hasEmailConfig));

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          name: name || null,
          email: email || null,
          image: image || null,
          // Only touch emailVerified when the email actually changed.
          ...(emailChanged ? { emailVerified: shouldReverify ? null : new Date() } : {}),
        },
        select: { id: true, name: true, email: true, image: true },
      });

      if (shouldReverify && updated.email) {
        try {
          // Invalidate any outstanding tokens before issuing a new one.
          await prisma.emailVerificationToken.deleteMany({ where: { userId } });
          const token = randomBytes(32).toString("hex");
          await prisma.emailVerificationToken.create({
            data: {
              userId,
              token,
              expiresAt: new Date(Date.now() + 1000 * 60 * 60),
            },
          });
          const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;
          await sendEmail({
            to: updated.email,
            subject: "Holoplax メールアドレス変更の確認",
            html: `<p>新しいメールアドレスを確認するには以下のリンクを開いてください。</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
          });
        } catch (mailError) {
          logger.error("Email change verification send failed", {}, mailError);
        }
      }

      await logAudit({
        actorId: userId,
        action: "ACCOUNT_UPDATE",
        targetUserId: userId,
        metadata: {
          nameChanged: !!name,
          emailChanged,
          imageChanged: !!image,
          reverificationSent: shouldReverify,
        },
      });
      return ok({ user: updated });
    },
  );
}
