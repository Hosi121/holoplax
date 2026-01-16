"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "../components/sidebar";
import { useWorkspaceId } from "../components/use-workspace-id";
import { AutomationSettingDTO } from "../../lib/types";

export default function AutomationPage() {
  const { workspaceId, ready } = useWorkspaceId();
  const [thresholds, setThresholds] = useState<AutomationSettingDTO>({ low: 35, high: 70 });
  const [dirty, setDirty] = useState(false);
  const rules = [
    { name: "低スコア自動委任", range: `< ${thresholds.low}`, status: "On" },
    { name: "中スコア分解提案", range: `${thresholds.low}-${thresholds.high}`, status: "On" },
    { name: "高スコア分割必須", range: `> ${thresholds.high}`, status: "On" },
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
    setThresholds({ low: data.low ?? 35, high: data.high ?? 70 });
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

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-10 lg:px-6 lg:py-14">
      <Sidebar />
      <main className="flex-1 space-y-6">
        <header className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                Automation
              </p>
              <h1 className="text-3xl font-semibold text-slate-900">自動化</h1>
              <p className="text-sm text-slate-600">
                スコアしきい値ごとの挙動を管理。低スコアはAI委任キュー、高スコアは自動分解（承認モードは環境変数
                AUTOMATION_REQUIRE_APPROVAL=true でON）。
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
    </div>
  );
}
