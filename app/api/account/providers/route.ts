import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AccountProviderUnlinkSchema } from "../../../../lib/contracts/auth";
import { parseBody } from "../../../../lib/http/validation";
import { unlinkAccountProvider } from "../../../../modules/identity/index.server";

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

      await unlinkAccountProvider(userId, provider);
      return ok({ success: true });
    },
  );
}
