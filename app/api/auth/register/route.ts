import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AuthRegisterSchema } from "../../../../lib/contracts/auth";
import { parseBody } from "../../../../lib/http/validation";
import { registerAccount } from "../../../../modules/identity/index.server";

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
      return ok(await registerAccount(body));
    },
  );
}
