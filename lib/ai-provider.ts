import { type AiUsageContext, recordAiUsage } from "./ai-usage";
import { safeDecrypt } from "./encryption";
import prisma from "./prisma";

export type AiProviderConfig = {
  model: string;
  apiKey: string;
  baseUrl?: string | null;
};

export type AiChatResult = {
  content: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  provider: string;
  model: string;
};

const DEFAULT_MODEL = "gpt-4o-mini";

const MODEL_PROVIDER_MAP: Record<string, string> = {
  "gpt-4o-mini": "OPENAI",
  "gpt-4o": "OPENAI",
  "openai/gpt-4o-mini": "OPENAI",
  "openai/gpt-4o": "OPENAI",
  "claude-3-5-sonnet-20240620": "ANTHROPIC",
  "claude-3-5-haiku-20241022": "ANTHROPIC",
  "anthropic/claude-3-5-sonnet-20240620": "ANTHROPIC",
  "anthropic/claude-3-5-haiku-20241022": "ANTHROPIC",
  "gemini-1.5-flash": "GEMINI",
  "gemini-1.5-pro": "GEMINI",
  "gemini/gemini-1.5-flash": "GEMINI",
  "gemini/gemini-1.5-pro": "GEMINI",
};

const MODEL_PREFIX_PROVIDER_MAP: Array<{ prefix: string; provider: string }> = [
  { prefix: "openai/", provider: "OPENAI" },
  { prefix: "anthropic/", provider: "ANTHROPIC" },
  { prefix: "gemini/", provider: "GEMINI" },
  { prefix: "google/", provider: "GEMINI" },
];

const resolveProviderKey = (model: string): string => {
  const normalized = model.trim().toLowerCase();
  const mapped = MODEL_PROVIDER_MAP[normalized];
  if (mapped) return mapped;
  for (const entry of MODEL_PREFIX_PROVIDER_MAP) {
    if (normalized.startsWith(entry.prefix)) return entry.provider;
  }
  if (normalized.startsWith("claude")) return "ANTHROPIC";
  if (normalized.startsWith("gemini")) return "GEMINI";
  if (normalized.startsWith("gpt-")) return "OPENAI";
  return "UNKNOWN";
};

const normalizeBaseUrl = (baseUrl?: string | null) => {
  const raw = baseUrl?.trim();
  if (!raw) return "https://api.openai.com/v1";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

const readEnvConfig = (): AiProviderConfig | null => {
  const apiKey =
    process.env.AI_API_KEY ?? process.env.LITELLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    model:
      process.env.AI_MODEL ??
      process.env.LITELLM_MODEL ??
      process.env.OPENAI_MODEL ??
      DEFAULT_MODEL,
    apiKey,
    baseUrl:
      process.env.AI_BASE_URL ??
      process.env.LITELLM_BASE_URL ??
      process.env.OPENAI_BASE_URL ??
      null,
  };
};

export async function resolveAiProvider(): Promise<AiProviderConfig | null> {
  const setting = await prisma.aiProviderSetting.findUnique({
    where: { id: 1 },
    select: { model: true, apiKey: true, baseUrl: true, enabled: true },
  });
  if (setting) {
    if (!setting.enabled || !setting.apiKey || !setting.model) return null;
    // Decrypt API key if encrypted, otherwise use as-is (legacy or env)
    const decryptedApiKey = safeDecrypt(setting.apiKey);
    if (!decryptedApiKey) {
      console.error("Failed to decrypt AI API key");
      return null;
    }
    return {
      model: setting.model,
      apiKey: decryptedApiKey,
      baseUrl: setting.baseUrl,
    };
  }
  return readEnvConfig();
}

const fetchOpenAiChat = async (
  config: AiProviderConfig,
  params: { system: string; user: string; maxTokens: number; userTag?: string },
): Promise<AiChatResult | null> => {
  const url = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      max_tokens: params.maxTokens,
      user: params.userTag,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? null;
  const responseModel = typeof data.model === "string" ? data.model : config.model;
  return {
    content,
    usage: data.usage ?? undefined,
    provider: resolveProviderKey(responseModel),
    model: responseModel,
  };
};

export async function requestAiChat(params: {
  system: string;
  user: string;
  maxTokens: number;
  context?: AiUsageContext;
}): Promise<AiChatResult | null> {
  const config = await resolveAiProvider();
  if (!config) return null;
  const result = await fetchOpenAiChat(config, {
    system: params.system,
    user: params.user,
    maxTokens: params.maxTokens,
    userTag: params.context?.userId ?? params.context?.workspaceId ?? undefined,
  });
  if (result && params.context) {
    void recordAiUsage({
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      context: params.context,
    });
  }
  return result;
}
