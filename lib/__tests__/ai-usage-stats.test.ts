import { describe, expect, it } from "vitest";
import { buildAiUsageCsv, csvEscape } from "../ai-usage/csv";
import {
  aggregateUsageStats,
  normalizeUsage,
  normalizeUsageRow,
  type PricingTable,
  resolveRange,
  type StatsUsageRow,
} from "../ai-usage/stats";

const EMPTY_PRICING: PricingTable = {};

const params = (query: Record<string, string>) => new URLSearchParams(query);

describe("resolveRange", () => {
  it("defaults to a 30-day window", () => {
    const range = resolveRange(params({}));
    expect(range?.mode).toBe("30d");
    expect(range?.start.getTime()).toBeLessThan(range?.end.getTime() ?? 0);
  });

  it("parses preset windows", () => {
    expect(resolveRange(params({ range: "7d" }))?.mode).toBe("7d");
    expect(resolveRange(params({ range: "90d" }))?.mode).toBe("90d");
  });

  it("rejects unknown modes", () => {
    expect(resolveRange(params({ range: "all" }))).toBeNull();
  });

  it("requires both ends for a custom range and rejects inverted ranges", () => {
    expect(resolveRange(params({ range: "custom", start: "2026-01-01" }))).toBeNull();
    expect(
      resolveRange(params({ range: "custom", start: "2026-02-01", end: "2026-01-01" })),
    ).toBeNull();
    const ok = resolveRange(params({ range: "custom", start: "2026-01-01", end: "2026-01-31" }));
    expect(ok?.label).toBe("2026-01-01 ~ 2026-01-31");
  });
});

describe("csvEscape", () => {
  it("passes through plain values", () => {
    expect(csvEscape("hello")).toBe("hello");
  });

  it("quotes and doubles embedded quotes/commas/newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("normalizeUsageRow", () => {
  it("infers a reported source and sums tokens when total is absent", () => {
    const usage = normalizeUsageRow(
      {
        provider: "openai",
        model: "gpt",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: null,
        costUsd: 0.25,
        usageSource: "weird",
      },
      EMPTY_PRICING,
    );
    expect(usage.totalTokens).toBe(15);
    expect(usage.usageSource).toBe("reported");
    expect(usage.costUsd).toBe(0.25);
  });

  it("marks unknown usage when there are no tokens", () => {
    const usage = normalizeUsage({ provider: "x", model: "y" }, EMPTY_PRICING);
    expect(usage.usageSource).toBe("unknown");
    expect(usage.totalTokens).toBeNull();
  });
});

const row = (over: Partial<StatsUsageRow>): StatsUsageRow => ({
  provider: "openai",
  model: "gpt",
  promptTokens: 10,
  completionTokens: 10,
  totalTokens: 20,
  costUsd: 1,
  usageSource: "reported",
  createdAt: new Date("2026-01-15T00:00:00Z"),
  user: { id: "u1", name: "U1", email: "u1@x" },
  workspace: { id: "w1", name: "W1" },
  ...over,
});

describe("aggregateUsageStats", () => {
  const range = resolveRange(params({ range: "30d" }))!;

  it("folds rows into totals and per-dimension buckets", () => {
    const stats = aggregateUsageStats({
      usageRows: [
        row({}),
        row({ provider: "gemini", user: { id: "u2", name: "U2", email: "u2@x" } }),
      ],
      legacyRows: [],
      pricingTable: EMPTY_PRICING,
      range,
      pricingSource: "test",
    });
    expect(stats.totals.logCount).toBe(2);
    expect(stats.totals.totalTokens).toBe(40);
    expect(stats.totals.totalCostUsd).toBe(2);
    expect(Object.keys(stats.byProvider).sort()).toEqual(["gemini", "openai"]);
    expect(Object.keys(stats.byUser).sort()).toEqual(["u1", "u2"]);
    expect(stats.byWorkspace.w1?.name).toBe("W1");
    expect(stats.pricingSource).toBe("test");
  });

  it("merges legacy AuditLog rows into the same aggregates", () => {
    const stats = aggregateUsageStats({
      usageRows: [row({})],
      legacyRows: [
        {
          metadata: {
            provider: "anthropic",
            model: "claude",
            promptTokens: 3,
            completionTokens: 7,
          },
          createdAt: new Date("2026-01-10T00:00:00Z"),
          actor: { id: "u9", name: "U9", email: "u9@x" },
          targetWorkspace: { id: "w9", name: "W9" },
        },
      ],
      pricingTable: EMPTY_PRICING,
      range,
      pricingSource: "test",
    });
    expect(stats.totals.logCount).toBe(2);
    expect(stats.byProvider.anthropic?.logCount).toBe(1);
    expect(stats.byUser.u9?.email).toBe("u9@x");
  });

  it("groups trend rows by week", () => {
    const stats = aggregateUsageStats({
      usageRows: [
        row({ createdAt: new Date("2026-01-05T00:00:00Z") }),
        row({ createdAt: new Date("2026-01-06T00:00:00Z") }),
        row({ createdAt: new Date("2026-01-19T00:00:00Z") }),
      ],
      legacyRows: [],
      pricingTable: EMPTY_PRICING,
      range,
      pricingSource: "test",
    });
    // 2026-01-05 (Mon) and 2026-01-06 share a week; 2026-01-19 is a later week.
    expect(stats.trends.weekly.length).toBe(2);
  });
});

describe("buildAiUsageCsv", () => {
  it("emits a header and one row per log, newest first", () => {
    const csv = buildAiUsageCsv({
      usageLogs: [
        {
          action: "AI_SCORE",
          provider: "openai",
          model: "gpt",
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
          costUsd: 0.5,
          usageSource: "reported",
          createdAt: new Date("2026-01-02T00:00:00Z"),
          user: { name: "U", email: "u@x" },
          workspace: { name: "W" },
        },
      ],
      legacyLogs: [
        {
          action: "AI_LEGACY",
          metadata: { provider: "anthropic", model: "claude" },
          createdAt: new Date("2026-01-03T00:00:00Z"),
          actor: { name: "A", email: "a@x" },
          targetWorkspace: { name: "WW" },
        },
      ],
      pricingTable: EMPTY_PRICING,
    });
    const lines = csv.split("\n");
    expect(lines[0]).toContain("createdAt,action,provider");
    expect(lines).toHaveLength(3);
    // legacy row (Jan 3) sorts above the usage row (Jan 2).
    expect(lines[1]).toContain("AI_LEGACY");
    expect(lines[2]).toContain("AI_SCORE");
  });
});
