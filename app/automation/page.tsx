"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceId } from "../components/use-workspace-id";
import { AutomationSettingDTO } from "../../lib/types";

export default function AutomationPage() {
  const { workspaceId, ready } = useWorkspaceId();
  const [thresholds, setThresholds] = useState<AutomationSettingDTO>({
    low: 35,
    high: 70,
    stage: 0,
  });
  const [dirty, setDirty] = useState(false);
  const effectiveLow = thresholds.effectiveLow ?? thresholds.low;
  const effectiveHigh = thresholds.effectiveHigh ?? thresholds.high;
  const rules = [
    { name: "AIによる自動タスク実行", range: `< ${effectiveLow}`, status: "On" },
    { name: "タスクの分解提案", range: `${effectiveLow}-${effectiveHigh}`, status: "On" },
    { name: "タスクの自動分割", range: `> ${effectiveHigh}`, status: "On" },
  ];

  const fetchThresholds = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setThresholds({ low: 35, high: 70 });
      setDirty(false);
      return;
    }
    const res = await fetch("/api/automation");
    const data = await res.json();
    setThresholds({
      low: data.low ?? 35,
      high: data.high ?? 70,
      stage: data.stage ?? 0,
      effectiveLow: data.effectiveLow ?? data.low ?? 35,
      effectiveHigh: data.effectiveHigh ?? data.high ?? 70,
    });
    setDirty(false);
  }, [ready, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchThresholds();
  }, [fetchThresholds]);

  const saveThresholds = async () => {
    await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(thresholds),
    });
    setDirty(false);
  };

  const resetStage = async () => {
    const res = await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ low: thresholds.low, high: thresholds.high, stage: 0 }),
    });
    if (res.ok) {
      const data = await res.json();
      setThresholds({
        low: data.low ?? thresholds.low,
        high: data.high ?? thresholds.high,
        stage: data.stage ?? 0,
        effectiveLow: data.effectiveLow ?? data.low ?? thresholds.low,
        effectiveHigh: data.effectiveHigh ?? data.high ?? thresholds.high,
      });
    }
  };

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Automation
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">自動化</h1>
            <p className="text-sm text-slate-600">
              AIによる自動化レベルの設定
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="number"
              value={thresholds.low}
              onChange={(e) => {
                setThresholds((p) => ({ ...p, low: Number(e.target.value) || 0 }));
                setDirty(true);
              }}
              className="w-20 border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
            />
            <input
              type="number"
              value={thresholds.high}
              onChange={(e) => {
                setThresholds((p) => ({ ...p, high: Number(e.target.value) || 0 }));
                setDirty(true);
              }}
              className="w-20 border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
            />
            <button
              onClick={saveThresholds}
              disabled={!dirty}
              className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="border border-slate-200 bg-slate-50 px-2 py-1">
            ステージ {thresholds.stage ?? 0}
          </span>
          <span className="border border-slate-200 bg-slate-50 px-2 py-1">
            有効閾値 {effectiveLow} / {effectiveHigh}
          </span>
          <button
            onClick={resetStage}
            className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
          >
            ステージをリセット
          </button>
        </div>
      </header>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          {rules.map((rule) => (
            <div
              key={rule.name}
              className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
            >
              <p className="text-slate-500">{rule.name}</p>
              <p className="text-xl font-semibold text-slate-900">{rule.range}</p>
              <p className="text-xs text-slate-600">ステータス: {rule.status}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
