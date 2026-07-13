import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AuthVerifySchema } from "../../../../lib/contracts/auth";
import { parseBody } from "../../../../lib/http/validation";
import { verifyEmail } from "../../../../modules/identity/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/auth/verify",
      errorFallback: {
        code: "AUTH_INTERNAL",
        message: "failed to verify email",
        status: 500,
      },
    },
    async () => {
      const body = await parseBody(request, AuthVerifySchema, { code: "AUTH_VALIDATION" });
      await verifyEmail(body.token);
      return ok({ ok: true });
    },
  );
}
