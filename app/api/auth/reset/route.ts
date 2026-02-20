import { hash } from "bcryptjs";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AuthResetSchema } from "../../../../lib/contracts/auth";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("AUTH");

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/auth/reset",
      errorFallback: {
        code: "AUTH_INTERNAL",
        message: "failed to reset password",
        status: 500,
      },
    },
    async () => {
      const body = await parseBody(request, AuthResetSchema, { code: "AUTH_VALIDATION" });
      const token = body.token;
      const password = body.password;

      // Hash the password BEFORE entering the transaction so the CPU-intensive
      // bcrypt work does not hold a database lock.
      const hashed = await hash(password, 10);

      // Validate and consume the token atomically to prevent two concurrent
      // requests from both resetting the password with the same token (TOCTOU).
      const userId = await prisma.$transaction(
        async (tx) => {
          const record = await tx.passwordResetToken.findUnique({ where: { token } });
          if (!record || record.used || record.expiresAt < new Date()) return null;

          await tx.userPassword.upsert({
            where: { userId: record.userId },
            update: { hash: hashed },
            create: { userId: record.userId, hash: hashed },
          });
          // Delete rather than mark used — keeps the table lean.
          await tx.passwordResetToken.delete({ where: { token } });
          return record.userId;
        },
        { isolationLevel: "Serializable" },
      );

      if (!userId) {
        return errors.badRequest("token is invalid or expired");
      }

      await logAudit({
        actorId: userId,
        action: "AUTH_PASSWORD_RESET",
        metadata: { via: "reset_token" },
      });
      return ok({ ok: true });
    },
  );
}
