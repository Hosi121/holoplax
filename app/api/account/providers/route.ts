import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AccountProviderUnlinkSchema } from "../../../../lib/contracts/auth";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("ACCOUNT_PROVIDER");

export async function DELETE(request: Request) {
  return withApiHandler(
    {
      logLabel: "DELETE /api/account/providers",
      errorFallback: {
        code: "ACCOUNT_PROVIDER_INTERNAL",
        message: "failed to unlink provider",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const { provider } = await parseBody(request, AccountProviderUnlinkSchema, {
        code: "ACCOUNT_PROVIDER_BAD_REQUEST",
      });

      const [accounts, hasPassword] = await Promise.all([
        prisma.account.findMany({
          where: { userId },
          select: { provider: true },
        }),
        prisma.userPassword.findUnique({
          where: { userId },
          select: { id: true }, // existence check only — never load the hash
        }),
      ]);

      if (accounts.length <= 1 && !hasPassword) {
        return errors.badRequest("少なくとも1つの認証方法が必要です");
      }

      await prisma.account.deleteMany({
        where: { userId, provider },
      });

      // Audit trail — unlinking an auth provider is a security-sensitive event.
      await logAudit({
        actorId: userId,
        action: "ACCOUNT_PROVIDER_UNLINK",
        targetUserId: userId,
        metadata: { provider },
      });

      return ok({ success: true });
    },
  );
}
