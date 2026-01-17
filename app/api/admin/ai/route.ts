import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  forbidden,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import prisma from "../../../../lib/prisma";

const PROVIDERS = ["OPENAI", "OPENAI_COMPATIBLE", "ANTHROPIC"] as const;

const getEnvFallback = () => ({
  provider: "OPENAI",
  model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  baseUrl: process.env.OPENAI_BASE_URL ?? "",
  enabled: false,
  hasApiKey: Boolean(process.env.OPENAI_API_KEY),
  source: "env",
});

export async function GET() {
  try {
    const { role } = await requireAuth();
    if (role !== "ADMIN") {
      return forbidden();
    }
    const setting = await prisma.aiProviderSetting.findUnique({
      where: { id: 1 },
      select: { provider: true, model: true, baseUrl: true, enabled: true, apiKey: true },
    });
    if (!setting) {
      return ok({ setting: getEnvFallback() });
    }
    return ok({
      setting: {
        provider: setting.provider,
        model: setting.model,
        baseUrl: setting.baseUrl ?? "",
        enabled: setting.enabled,
        hasApiKey: Boolean(setting.apiKey),
        source: "db",
      },
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/admin/ai error", error);
    return serverError("failed to load ai settings");
  }
}

export async function POST(request: Request) {
  try {
    const { userId, role } = await requireAuth();
    if (role !== "ADMIN") {
      return forbidden();
    }
    const body = await request.json().catch(() => ({}));
    const provider = String(body.provider ?? "").toUpperCase();
    if (!PROVIDERS.includes(provider as (typeof PROVIDERS)[number])) {
      return badRequest("invalid provider");
    }
    const rawModel = String(body.model ?? "").trim();
    if (!rawModel && provider === "ANTHROPIC") {
      return badRequest("model is required for anthropic");
    }
    const model =
      rawModel || (provider === "ANTHROPIC" ? "" : "gpt-4o-mini");
    const baseUrl = String(body.baseUrl ?? "").trim() || null;
    const enabled = Boolean(body.enabled);
    const apiKey = String(body.apiKey ?? "").trim();

    const existing = await prisma.aiProviderSetting.findUnique({
      where: { id: 1 },
      select: { apiKey: true },
    });
    const nextApiKey = apiKey || existing?.apiKey || "";
    if (!nextApiKey) {
      return badRequest("apiKey is required");
    }

    const setting = await prisma.aiProviderSetting.upsert({
      where: { id: 1 },
      update: {
        provider: provider as (typeof PROVIDERS)[number],
        model,
        baseUrl,
        enabled,
        apiKey: nextApiKey,
      },
      create: {
        id: 1,
        provider: provider as (typeof PROVIDERS)[number],
        model,
        baseUrl,
        enabled,
        apiKey: nextApiKey,
      },
      select: { provider: true, model: true, baseUrl: true, enabled: true },
    });

    await logAudit({
      actorId: userId,
      action: "AI_PROVIDER_UPDATE",
      metadata: {
        provider: setting.provider,
        model: setting.model,
        enabled: setting.enabled,
        baseUrl: setting.baseUrl,
      },
    });

    return ok({ setting: { ...setting, hasApiKey: true, source: "db" } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/admin/ai error", error);
    return serverError("failed to update ai settings");
  }
}
