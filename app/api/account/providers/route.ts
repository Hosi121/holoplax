import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { createDomainErrors } from "../../../../lib/http/errors";
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
      const { provider } = await request.json();

      if (!provider || typeof provider !== "string") {
        return errors.badRequest("provider is required");
      }

      const [accounts, hasPassword] = await Promise.all([
        prisma.account.findMany({
          where: { userId },
          select: { provider: true },
        }),
        prisma.userPassword.findUnique({
          where: { userId },
        }),
      ]);

      if (accounts.length <= 1 && !hasPassword) {
        return errors.badRequest("少なくとも1つの認証方法が必要です");
      }

      await prisma.account.deleteMany({
        where: { userId, provider },
      });

      return ok({ success: true });
    },
  );
}
