import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { DiscordIntakeSchema } from "../../../../lib/contracts/integrations";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { validateSharedToken, verifyIntegrationSignature } from "../../../../lib/integrations/auth";
import { captureDiscordIntake } from "../../../../modules/intake/index.server";

export async function POST(request: Request) {
  const errors = createDomainErrors("INTEGRATION");
  return withApiHandler(
    {
      logLabel: "POST /api/integrations/discord",
      errorFallback: {
        code: "INTEGRATION_INTERNAL",
        message: "failed to handle discord request",
        status: 500,
      },
    },
    async () => {
      const authError = validateSharedToken(request, ["DISCORD_INTEGRATION_TOKEN"]);
      if (authError) return authError;
      const sigError = await verifyIntegrationSignature(request, ["DISCORD_SIGNING_SECRET"]);
      if (sigError) return sigError;

      const body = await parseBody(request, DiscordIntakeSchema, {
        code: "INTEGRATION_VALIDATION",
        allowEmpty: true,
      });

      const title = String(body.title ?? "").trim();
      const rawBody = String(body.body ?? "").trim();
      const author = String(body.author ?? "").trim();
      const channel = String(body.channel ?? "").trim();

      if (!title) {
        return errors.badRequest("title is required");
      }

      const userId = process.env.DISCORD_USER_ID ?? process.env.INTEGRATION_USER_ID ?? "";

      if (!userId) {
        return errors.badRequest("userId not resolved; set DISCORD_USER_ID or INTEGRATION_USER_ID");
      }
      return ok(
        await captureDiscordIntake({
          userId,
          title,
          body: rawBody,
          author,
          channel,
          payload: {
            dueDate: body.dueDate ?? null,
            urgency: body.urgency ?? null,
            points: body.points ?? null,
            threadId: body.threadId ?? null,
            threadUrl: body.threadUrl ?? null,
            messageUrl: body.messageUrl ?? null,
          },
        }),
      );
    },
  );
}
