import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { AccountUpdateSchema } from "../../../lib/contracts/auth";
import { parseBody } from "../../../lib/http/validation";
import { getAccount, updateAccount } from "../../../modules/identity/index.server";

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
      return ok(await getAccount(userId));
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
      return ok(await updateAccount(userId, body));
    },
  );
}
