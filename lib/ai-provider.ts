import prisma from "./prisma";

export type AiProvider = "OPENAI" | "OPENAI_COMPATIBLE" | "ANTHROPIC";

export type AiProviderConfig = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
};

export type AiChatResult = {
  content: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  provider: AiProvider;
  model: string;
};

const DEFAULT_MODEL = "gpt-4o-mini";

const readEnvConfig = (): AiProviderConfig | null => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    provider: "OPENAI",
    model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL ?? null,
  };
};

export async function resolveAiProvider(): Promise<AiProviderConfig | null> {
  const setting = await prisma.aiProviderSetting.findUnique({
    where: { id: 1 },
    select: { provider: true, model: true, apiKey: true, baseUrl: true, enabled: true },
  });
  if (setting) {
    if (!setting.enabled || !setting.apiKey || !setting.model) return null;
    return {
      provider: setting.provider,
      model: setting.model,
      apiKey: setting.apiKey,
      baseUrl: setting.baseUrl,
    };
  }
  return readEnvConfig();
}

const fetchOpenAiChat = async (
  config: AiProviderConfig,
  params: { system: string; user: string; maxTokens: number },
): Promise<AiChatResult | null> => {
  const baseUrl = config.baseUrl?.trim() || "https://api.openai.com/v1";
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
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
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? null;
  return {
    content,
    usage: data.usage ?? undefined,
    provider: config.provider,
    model: config.model,
  };
};

const fetchAnthropicChat = async (
  config: AiProviderConfig,
  params: { system: string; user: string; maxTokens: number },
): Promise<AiChatResult | null> => {
  const baseUrl = config.baseUrl?.trim() || "https://api.anthropic.com";
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      system: params.system,
      max_tokens: params.maxTokens,
      messages: [{ role: "user", content: params.user }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = Array.isArray(data.content)
    ? data.content.map((part: { text?: string }) => part.text ?? "").join("")
    : null;
  const usage = data.usage
    ? {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      }
    : undefined;
  return {
    content: content || null,
    usage,
    provider: config.provider,
    model: config.model,
  };
};

export async function requestAiChat(params: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<AiChatResult | null> {
  const config = await resolveAiProvider();
  if (!config) return null;
  if (config.provider === "ANTHROPIC") {
    return fetchAnthropicChat(config, params);
  }
  return fetchOpenAiChat(config, params);
}
