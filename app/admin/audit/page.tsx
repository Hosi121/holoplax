"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type UsageSummary = {
  provider: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  usageSource: "reported" | "estimated" | "unknown";
  pricingMatched: boolean;
};

type AuditLog = {
  id: string;
  action: string;
  createdAt: string;
  actor: { name: string | null; email: string | null };
  targetUser?: { name: string | null; email: string | null } | null;
  targetWorkspace?: { name: string | null } | null;
  metadata?: Record<string, unknown> | null;
  usage?: UsageSummary | null;
};

type UsageBucket = {
  totalCostUsd: number;
  totalTokens: number;
  logCount: number;
  unknownUsageCount: number;
  missingPricingCount: number;
};

type TrendPoint = UsageBucket & {
  label: string;
  start: string;
  end: string;
};

type AiStats = {
  range: { start: string; end: string; label: string; mode: string };
  totals: {
    totalCostUsd: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    logCount: number;
    unknownUsageCount: number;
    missingPricingCount: number;
  };
  byProvider: Record<string, UsageBucket>;
  byModel: Record<string, UsageBucket>;
  byWorkspace: Record<string, UsageBucket & { name: string | null }>;
  byUser: Record<string, UsageBucket & { name: string | null; email: string | null }>;
  trends: {
    weekly: TrendPoint[];
    monthly: TrendPoint[];
  };
  pricingSource: "db" | "env" | "default";
};

type RangeMode = "7d" | "30d" | "90d" | "custom";

const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);

const formatUsd = (value: number | null) =>
  typeof value === "number" ? `$${value.toFixed(6)}` : "-";

const sortBuckets = <T extends UsageBucket>(entries: Array<[string, T]>) => {
  const hasCost = entries.some(([, data]) => data.totalCostUsd > 0);
  return [...entries].sort((a, b) => {
    if (hasCost) return b[1].totalCostUsd - a[1].totalCostUsd;
    return b[1].totalTokens - a[1].totalTokens;
  });
};

const TrendChart = ({ title, data }: { title: string; data: TrendPoint[] }) => {
  const hasCost = data.some((item) => item.totalCostUsd > 0);
  const values = data.map((item) => (hasCost ? item.totalCostUsd : item.totalTokens));
  const maxValue = Math.max(1, ...values);

  return (
    <div className="border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
          {hasCost ? "Cost" : "Tokens"}
        </span>
      </div>
      {data.length ? (
        <div className="mt-3 grid gap-2">
          {data.map((item) => {
            const value = hasCost ? item.totalCostUsd : item.totalTokens;
            const height = Math.max(6, Math.round((value / maxValue) * 48));
            return (
              <div key={item.start} className="grid grid-cols-[80px_1fr_120px] items-center gap-3">
                <span className="text-[11px] text-slate-500">{item.label}</span>
                <div className="flex h-12 items-end rounded bg-slate-100">
                  <div
                    className="w-full rounded bg-[#2323eb]/60"
                    style={{ height: `${height}px` }}
                  />
                </div>
                <span className="text-[11px] text-slate-500">
                  {hasCost
                    ? formatUsd(item.totalCostUsd)
                    : `${item.totalTokens.toLocaleString()} tok`}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">データがありません。</p>
      )}
    </div>
  );
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "ai">("all");
  const [stats, setStats] = useState<AiStats | null>(null);
  const [range, setRange] = useState<RangeMode>("30d");
  const [customStart, setCustomStart] = useState(() =>
    toDateInputValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)),
  );
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filter === "ai") params.set("filter", "ai");
    if (filter === "ai") {
      params.set("range", range);
      if (range === "custom") {
        params.set("start", customStart);
        params.set("end", customEnd);
      }
    }
    return params.toString();
  }, [customEnd, customStart, filter, range]);

  const fetchLogs = useCallback(async () => {
    setError(null);
    setLoading(true);
    const url = query ? `/api/admin/audit?${query}` : "/api/admin/audit";
    const res = await apiFetch(url);
    if (!res.ok) {
      setError(res.status === 403 ? "権限がありません。" : "取得に失敗しました。");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setLogs(data.logs ?? []);
    setStats(data.stats ?? null);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLogs();
  }, [fetchLogs]);

  const exportCsv = () => {
    if (filter !== "ai") return;
    const params = new URLSearchParams(query);
    params.set("format", "csv");
    window.open(`/api/admin/audit?${params.toString()}`, "_blank");
  };

  const breakdownByProvider = stats ? sortBuckets(Object.entries(stats.byProvider)) : [];
  const breakdownByModel = stats ? sortBuckets(Object.entries(stats.byModel)) : [];

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Admin</p>
            <h1 className="text-3xl font-semibold text-slate-900">監査ログ</h1>
            <p className="text-sm text-slate-600">管理者操作とAI使用履歴を記録します。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 border border-slate-200 bg-white p-1 text-xs text-slate-700">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1 transition ${
                  filter === "all"
                    ? "bg-[#2323eb]/10 text-[#2323eb]"
                    : "text-slate-600 hover:text-[#2323eb]"
                }`}
              >
                全て
              </button>
              <button
                onClick={() => setFilter("ai")}
                className={`px-3 py-1 transition ${
                  filter === "ai"
                    ? "bg-[#2323eb]/10 text-[#2323eb]"
                    : "text-slate-600 hover:text-[#2323eb]"
                }`}
              >
                AI
              </button>
            </div>
            {filter === "ai" ? (
              <div className="flex items-center gap-2 border border-slate-200 bg-white p-1 text-xs text-slate-700">
                {(
                  [
                    ["7d", "7日"],
                    ["30d", "30日"],
                    ["90d", "90日"],
                    ["custom", "カスタム"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setRange(value)}
                    className={`px-3 py-1 transition ${
                      range === value
                        ? "bg-[#2323eb]/10 text-[#2323eb]"
                        : "text-slate-600 hover:text-[#2323eb]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {filter === "ai" && range === "custom" ? (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="border border-slate-200 px-2 py-1 text-xs text-slate-700"
                />
                <span>〜</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="border border-slate-200 px-2 py-1 text-xs text-slate-700"
                />
              </div>
            ) : null}
            <button
              onClick={fetchLogs}
              className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              {loading ? "更新中..." : "更新"}
            </button>
            {filter === "ai" ? (
              <button
                onClick={exportCsv}
                className="border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
              >
                CSV
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {stats && filter === "ai" ? (
        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">AI Usage</p>
              <h2 className="text-lg font-semibold text-slate-900">集計</h2>
              <p className="text-xs text-slate-500">期間: {stats.range.label}</p>
            </div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Pricing: {stats.pricingSource}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Total Cost</p>
              <p className="text-sm font-semibold text-slate-900">
                {formatUsd(stats.totals.totalCostUsd)}
              </p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Tokens Total</p>
              <p className="text-sm font-semibold text-slate-900">
                {stats.totals.totalTokens.toLocaleString()}
              </p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Prompt</p>
              <p className="text-sm font-semibold text-slate-900">
                {stats.totals.promptTokens.toLocaleString()}
              </p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Completion</p>
              <p className="text-sm font-semibold text-slate-900">
                {stats.totals.completionTokens.toLocaleString()}
              </p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Unknown Usage</p>
              <p className="text-sm font-semibold text-slate-900">
                {stats.totals.unknownUsageCount.toLocaleString()}
              </p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Missing Pricing
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {stats.totals.missingPricingCount.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">Providers</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-600">
                {breakdownByProvider.length ? (
                  breakdownByProvider.map(([provider, data]) => (
                    <div
                      key={provider}
                      className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2"
                    >
                      <span className="font-semibold text-slate-800">{provider}</span>
                      <span>
                        {formatUsd(data.totalCostUsd)} / {data.totalTokens.toLocaleString()} tok ·{" "}
                        {data.logCount} logs
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400">データがありません。</p>
                )}
              </div>
            </div>
            <div className="border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">Models</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-600">
                {breakdownByModel.length ? (
                  breakdownByModel.map(([model, data]) => (
                    <div
                      key={model}
                      className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2"
                    >
                      <span className="font-semibold text-slate-800">{model}</span>
                      <span>
                        {formatUsd(data.totalCostUsd)} / {data.totalTokens.toLocaleString()} tok ·{" "}
                        {data.logCount} logs
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400">データがありません。</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">Workspaces</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-600">
                {stats && Object.keys(stats.byWorkspace).length ? (
                  sortBuckets(
                    Object.entries(stats.byWorkspace) as Array<
                      [string, UsageBucket & { name: string | null }]
                    >,
                  ).map(([key, data]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2"
                    >
                      <span className="font-semibold text-slate-800">{data.name ?? key}</span>
                      <span>
                        {formatUsd(data.totalCostUsd)} / {data.totalTokens.toLocaleString()} tok ·{" "}
                        {data.logCount} logs
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400">データがありません。</p>
                )}
              </div>
            </div>
            <div className="border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">Users</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-600">
                {stats && Object.keys(stats.byUser).length ? (
                  sortBuckets(
                    Object.entries(stats.byUser) as Array<
                      [string, UsageBucket & { name: string | null; email: string | null }]
                    >,
                  ).map(([key, data]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2"
                    >
                      <span className="font-semibold text-slate-800">
                        {data.name ?? data.email ?? key}
                      </span>
                      <span>
                        {formatUsd(data.totalCostUsd)} / {data.totalTokens.toLocaleString()} tok ·{" "}
                        {data.logCount} logs
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400">データがありません。</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <TrendChart title="Weekly Trend" data={stats.trends.weekly} />
            <TrendChart title="Monthly Trend" data={stats.trends.monthly} />
          </div>
        </section>
      ) : null}

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        {error ? (
          <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <div className="grid gap-2">
            <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <span>操作</span>
              <span>操作者</span>
              <span>対象</span>
              <span>時刻</span>
            </div>
            {logs.map((log) => {
              const usage = log.usage ?? null;
              const meta =
                log.metadata && typeof log.metadata === "object"
                  ? (log.metadata as Record<string, unknown>)
                  : null;
              const provider =
                usage?.provider ?? (typeof meta?.provider === "string" ? meta.provider : null);
              const model = usage?.model ?? (typeof meta?.model === "string" ? meta.model : null);
              const promptTokens =
                usage?.promptTokens ??
                (typeof meta?.promptTokens === "number" ? meta.promptTokens : null);
              const completionTokens =
                usage?.completionTokens ??
                (typeof meta?.completionTokens === "number" ? meta.completionTokens : null);
              const totalTokens =
                usage?.totalTokens ??
                (typeof meta?.totalTokens === "number" ? meta.totalTokens : null);
              const usageLine: string[] = [];
              if (provider) usageLine.push(provider);
              if (model) usageLine.push(model);
              if (typeof totalTokens === "number") {
                usageLine.push(`${totalTokens.toLocaleString()} tok`);
              }
              if (typeof promptTokens === "number" && typeof completionTokens === "number") {
                usageLine.push(`(${promptTokens}/${completionTokens})`);
              }
              if (typeof usage?.costUsd === "number") {
                usageLine.push(formatUsd(usage.costUsd));
              } else if (usage?.usageSource === "unknown") {
                usageLine.push("usage unknown");
              } else if (usage && !usage.pricingMatched) {
                usageLine.push("pricing missing");
              }
              return (
                <div
                  key={log.id}
                  className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-3 border border-slate-200 px-3 py-2 text-sm text-slate-800"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-slate-600">{log.action}</span>
                    {usageLine.length ? (
                      <span className="text-[11px] text-slate-500">{usageLine.join(" · ")}</span>
                    ) : null}
                  </div>
                  <span className="text-xs text-slate-600">
                    {log.actor?.name ?? log.actor?.email ?? "-"}
                  </span>
                  <span className="text-xs text-slate-600">
                    {log.targetUser?.name ??
                      log.targetUser?.email ??
                      log.targetWorkspace?.name ??
                      "-"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
