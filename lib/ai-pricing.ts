import prisma from "./prisma";

export type AiPricingTable = Record<string, Record<string, { input: number; output: number }>>;
export type AiPricingSource = "db" | "env" | "default";

const DEFAULT_PRICING_USD_PER_M: AiPricingTable = {
  OPENAI: {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4o": { input: 5, output: 15 },
  },
  ANTHROPIC: {
    "claude-3-5-sonnet-20240620": { input: 3, output: 15 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  },
};

const roundUsd = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const mergePricingTables = (base: AiPricingTable, overrides: AiPricingTable) => {
  const merged: AiPricingTable = { ...base };
  for (const [provider, models] of Object.entries(overrides)) {
    merged[provider] = { ...(merged[provider] ?? {}), ...models };
  }
  return merged;
};

const parsePricingJson = (raw: string): AiPricingTable | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const table: AiPricingTable = {};
    for (const [provider, models] of Object.entries(parsed as Record<string, unknown>)) {
      if (!models || typeof models !== "object") continue;
      for (const [model, prices] of Object.entries(models as Record<string, unknown>)) {
        if (!prices || typeof prices !== "object") continue;
        const input = (prices as { input?: unknown }).input;
        const output = (prices as { output?: unknown }).output;
        if (typeof input !== "number" || typeof output !== "number") continue;
        if (!table[provider]) table[provider] = {};
        table[provider][model] = { input, output };
      }
    }
    return Object.keys(table).length ? table : null;
  } catch {
    return null;
  }
};

export async function loadAiPricingTable(): Promise<{
  table: AiPricingTable;
  source: AiPricingSource;
}> {
  let rows: Array<{
    provider: unknown;
    model: string;
    inputUsdPerM: number;
    outputUsdPerM: number;
  }> = [];
  try {
    rows = await prisma.aiPricing.findMany({
      select: {
        provider: true,
        model: true,
        inputUsdPerM: true,
        outputUsdPerM: true,
      },
    });
  } catch {
    rows = [];
  }
  if (rows.length) {
    const table: AiPricingTable = {};
    for (const row of rows) {
      const provider = String(row.provider);
      if (!table[provider]) table[provider] = {};
      table[provider][row.model] = {
        input: row.inputUsdPerM,
        output: row.outputUsdPerM,
      };
    }
    return { table, source: "db" };
  }

  const envTable = parsePricingJson(process.env.AI_PRICING_JSON ?? "");
  if (envTable) {
    return {
      table: mergePricingTables(DEFAULT_PRICING_USD_PER_M, envTable),
      source: "env",
    };
  }

  return { table: DEFAULT_PRICING_USD_PER_M, source: "default" };
}

export function calculateAiUsageCost(params: {
  pricingTable: AiPricingTable;
  provider: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}): { costUsd: number | null; pricingMatched: boolean } {
  const { pricingTable, provider, model, promptTokens, completionTokens } = params;
  if (!provider || !model) return { costUsd: null, pricingMatched: false };
  const pricing = pricingTable[provider]?.[model];
  if (!pricing) return { costUsd: null, pricingMatched: false };
  if (promptTokens === null && completionTokens === null) {
    return { costUsd: null, pricingMatched: true };
  }
  const prompt = promptTokens ?? 0;
  const completion = completionTokens ?? 0;
  const costUsd = roundUsd(
    (prompt / 1_000_000) * pricing.input + (completion / 1_000_000) * pricing.output,
  );
  return { costUsd, pricingMatched: true };
}
