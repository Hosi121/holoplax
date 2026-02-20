import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { DiscordIntakeSchema } from "../../../../lib/contracts/integrations";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { validateSharedToken } from "../../../../lib/integrations/auth";
import prisma from "../../../../lib/prisma";

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

      // Build description with metadata
      const meta = [author && `by: ${author}`, channel && `ch: #${channel}`]
        .filter(Boolean)
        .join(" | ");
      const bodyText = meta ? `${rawBody}\n\n---\n${meta}` : rawBody;

      // Create IntakeItem (Global Inbox)
      const item = await prisma.intakeItem.create({
        data: {
          source: "DISCORD",
          status: "PENDING",
          title: title.slice(0, 140),
          body: bodyText,
          user: { connect: { id: userId } },
        },
      });

      await logAudit({
        actorId: userId,
        action: "INTEGRATION_DISCORD_INTAKE_CREATE",
        metadata: { itemId: item.id, title: item.title, author, channel },
      });
      return ok({ itemId: item.id });
    },
  );
}
