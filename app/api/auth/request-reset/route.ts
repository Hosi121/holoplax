import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AuthRequestResetSchema } from "../../../../lib/contracts/auth";
import { parseBody } from "../../../../lib/http/validation";
import { requestPasswordReset } from "../../../../modules/identity/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/auth/request-reset",
      errorFallback: {
        code: "AUTH_INTERNAL",
        message: "failed to request reset",
        status: 500,
      },
    },
    async () => {
      const body = await parseBody(request, AuthRequestResetSchema, { code: "AUTH_VALIDATION" });
      await requestPasswordReset(body.email);
      return ok({ ok: true });
    },
  );
}
