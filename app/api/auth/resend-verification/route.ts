import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AuthResendVerificationSchema } from "../../../../lib/contracts/auth";
import { parseBody } from "../../../../lib/http/validation";
import { resendEmailVerification } from "../../../../modules/identity/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/auth/resend-verification",
      errorFallback: {
        code: "AUTH_INTERNAL",
        message: "failed to resend verification email",
        status: 500,
      },
    },
    async () => {
      const body = await parseBody(request, AuthResendVerificationSchema, {
        code: "AUTH_VALIDATION",
      });
      await resendEmailVerification(body.email, body.callbackUrl);
      return ok({ ok: true });
    },
  );
}
