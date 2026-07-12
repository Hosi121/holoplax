"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { VelocityEntryDTO } from "../../lib/types";
import { useWorkspaceId } from "../components/use-workspace-id";

export default function VelocityPage() {
  const { workspaceId, ready } = useWorkspaceId();
  const [history, setHistory] = useState<VelocityEntryDTO[]>([]);
  const [summary, setSummary] = useState<{
    avg: number;
    variance: number;
    stdDev: number;
    stableRange: string | null;
  } | null>(null);
  const [pbiSummary, setPbiSummary] = useState<{
    sprintId: string | null;
    doneCount: number;
    donePoints: number;
    totalCount: number;
    completionRate: number;
  } | null>(null);

  const fetchVelocity = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setHistory([]);
      return;
    }
    const res = await apiFetch("/api/velocity");
    const data = await res.json();
    setHistory(data.velocity ?? []);
    setSummary(data.summary ?? null);
    setPbiSummary(data.pbi ?? null);
  }, [ready, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchVelocity();
  }, [fetchVelocity]);

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Velocity</p>
            <h1 className="text-3xl font-semibold text-slate-900">ベロシティ</h1>
            <p className="text-sm text-slate-600">
              Sprint 終了時に確定したポイントとレンジを自動集計。
            </p>
          </div>
        </div>
      </header>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            <p className="text-xs text-slate-500">持続ベロシティ</p>
            <p className="text-2xl font-semibold text-slate-900">
              {summary ? summary.avg.toFixed(1) : "—"} pt
            </p>
            <p className="text-xs text-slate-500">
              分散: {summary ? summary.variance.toFixed(1) : "—"} / 範囲:{" "}
              {summary?.stableRange ?? "—"}
            </p>
          </div>
          <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            <p className="text-xs text-slate-500">PBI消化</p>
            <p className="text-2xl font-semibold text-slate-900">
              {pbiSummary ? `${pbiSummary.doneCount}/${pbiSummary.totalCount}` : "—"}
            </p>
            <p className="text-xs text-slate-500">
              消化率: {pbiSummary ? Math.round(pbiSummary.completionRate * 100) : "—"}%
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {history.map((item) => (
            <div
              key={item.id}
              className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
            >
              <p className="text-slate-500">{item.name}</p>
              <p className="text-2xl font-semibold text-slate-900">{item.points} pt</p>
              <p className="text-xs text-slate-500">レンジ: {item.range}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
