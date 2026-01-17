"use client";

import { useCallback, useEffect, useState } from "react";

type AuditLog = {
  id: string;
  action: string;
  createdAt: string;
  actor: { name: string | null; email: string | null };
  targetUser?: { name: string | null; email: string | null } | null;
  targetWorkspace?: { name: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

type AiStats = {
  totalCostUsd: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byModel: Record<string, { totalCostUsd: number; totalTokens: number }>;
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "ai">("all");
  const [stats, setStats] = useState<AiStats | null>(null);

  const fetchLogs = useCallback(async () => {
    setError(null);
    const query = filter === "ai" ? "?filter=ai" : "";
    const res = await fetch(`/api/admin/audit${query}`);
    if (!res.ok) {
      setError(res.status === 403 ? "権限がありません。" : "取得に失敗しました。");
      return;
    }
    const data = await res.json();
    setLogs(data.logs ?? []);
    setStats(data.stats ?? null);
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLogs();
  }, [fetchLogs]);

  const formatUsd = (value: number) => `$${value.toFixed(6)}`;

  return (

    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Admin
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">監査ログ</h1>
            <p className="text-sm text-slate-600">
              管理者操作とAI使用履歴を記録します。
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            <button
              onClick={fetchLogs}
              className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              更新
            </button>
          </div>
        </div>
      </header>

      {stats && filter === "ai" ? (
        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Total Cost
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {formatUsd(stats.totalCostUsd)}
              </p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Tokens Total
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {stats.totalTokens.toLocaleString()}
              </p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Prompt Tokens
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {stats.promptTokens.toLocaleString()}
              </p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Completion Tokens
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {stats.completionTokens.toLocaleString()}
              </p>
            </div>
          </div>
          {Object.keys(stats.byModel).length ? (
            <div className="mt-4 grid gap-2 text-xs text-slate-600">
              {Object.entries(stats.byModel).map(([model, data]) => (
                <div
                  key={model}
                  className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2"
                >
                  <span className="font-semibold text-slate-800">{model}</span>
                  <span>
                    {formatUsd(data.totalCostUsd)} / {data.totalTokens.toLocaleString()} tok
                  </span>
                </div>
              ))}
            </div>
          ) : null}
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
              const meta =
                log.metadata && typeof log.metadata === "object"
                  ? (log.metadata as Record<string, unknown>)
                  : null;
              const model = typeof meta?.model === "string" ? meta.model : null;
              const promptTokens =
                typeof meta?.promptTokens === "number" ? meta.promptTokens : null;
              const completionTokens =
                typeof meta?.completionTokens === "number"
                  ? meta.completionTokens
                  : null;
              const totalTokens =
                typeof meta?.totalTokens === "number" ? meta.totalTokens : null;
              const costUsd = typeof meta?.costUsd === "number" ? meta.costUsd : null;
              return (
                <div
                  key={log.id}
                  className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-3 border border-slate-200 px-3 py-2 text-sm text-slate-800"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-slate-600">
                      {log.action}
                    </span>
                    {model ? (
                      <span className="text-[11px] text-slate-500">
                        {model}
                        {typeof totalTokens === "number"
                          ? ` · ${totalTokens.toLocaleString()} tok`
                          : ""}
                        {typeof promptTokens === "number" &&
                        typeof completionTokens === "number"
                          ? ` (${promptTokens}/${completionTokens})`
                          : ""}
                        {typeof costUsd === "number"
                          ? ` · ${formatUsd(costUsd)}`
                          : ""}
                      </span>
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
