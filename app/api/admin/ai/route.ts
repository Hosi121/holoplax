import { requireAdmin } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AdminAiUpdateSchema } from "../../../../lib/contracts/admin";
import { encrypt, isEncrypted, safeDecrypt } from "../../../../lib/encryption";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

const DEFAULT_MODEL = "gpt-4o-mini";
const errors = createDomainErrors("ADMIN");

const getEnvFallback = () => ({
  model:
    process.env.AI_MODEL ?? process.env.LITELLM_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  baseUrl:
    process.env.AI_BASE_URL ?? process.env.LITELLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "",
  enabled: false,
  hasApiKey: Boolean(
    process.env.AI_API_KEY ?? process.env.LITELLM_API_KEY ?? process.env.OPENAI_API_KEY,
  ),
  source: "env",
});

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/admin/ai",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to load ai settings",
        status: 500,
      },
    },
    async () => {
      await requireAdmin("ADMIN");
      const setting = await prisma.aiProviderSetting.findUnique({
        where: { id: 1 },
        select: { model: true, baseUrl: true, enabled: true, apiKey: true },
      });
      if (!setting) {
        return ok({ setting: getEnvFallback() });
      }
      return ok({
        setting: {
          model: setting.model,
          baseUrl: setting.baseUrl ?? "",
          enabled: setting.enabled,
          hasApiKey: Boolean(setting.apiKey),
          source: "db",
        },
      });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/admin/ai",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to update ai settings",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAdmin("ADMIN");
      const body = await parseBody(request, AdminAiUpdateSchema, {
        code: "ADMIN_VALIDATION",
        allowEmpty: true,
      });
      const rawModel = String(body.model ?? "").trim();
      const model =
        rawModel ||
        process.env.AI_MODEL ||
        process.env.LITELLM_MODEL ||
        process.env.OPENAI_MODEL ||
        DEFAULT_MODEL;
      if (!model) {
        return errors.badRequest("model is required");
      }
      const baseUrl = String(body.baseUrl ?? "").trim() || null;
      const enabled = Boolean(body.enabled);
      const apiKey = String(body.apiKey ?? "").trim();

      const existing = await prisma.aiProviderSetting.findUnique({
        where: { id: 1 },
        select: { apiKey: true },
      });

      // Determine the API key to use
      let nextApiKey: string;
      if (apiKey) {
        // New API key provided - encrypt it
        nextApiKey = encrypt(apiKey);
      } else if (existing?.apiKey) {
        // Keep existing (already encrypted or legacy)
        nextApiKey = isEncrypted(existing.apiKey) ? existing.apiKey : encrypt(existing.apiKey);
      } else {
        return errors.badRequest("apiKey is required");
      }

      const setting = await prisma.aiProviderSetting.upsert({
        where: { id: 1 },
        update: {
          model,
          baseUrl,
          enabled,
          apiKey: nextApiKey,
        },
        create: {
          id: 1,
          model,
          baseUrl,
          enabled,
          apiKey: nextApiKey,
        },
        select: { model: true, baseUrl: true, enabled: true },
      });

      await logAudit({
        actorId: userId,
        action: "AI_PROVIDER_UPDATE",
        metadata: {
          model: setting.model,
          enabled: setting.enabled,
          baseUrl: setting.baseUrl,
        },
      });

      return ok({ setting: { ...setting, hasApiKey: true, source: "db" } });
    },
  );
}
