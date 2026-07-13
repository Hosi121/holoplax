import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AuthResetSchema } from "../../../../lib/contracts/auth";
import { parseBody } from "../../../../lib/http/validation";
import { resetPassword } from "../../../../modules/identity/index.server";

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
      await resetPassword(body.token, body.password);
      return ok({ ok: true });
    },
  );
}
