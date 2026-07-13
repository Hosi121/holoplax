"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { AutomationSettingDTO } from "../../lib/types";
import { NAV_LABELS } from "../../lib/ui-language";
import { useToast } from "../components/toast";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { useWorkspaceId } from "../components/use-workspace-id";

export default function AutomationPage() {
  const toast = useToast();
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
    { name: "AIに任せる", range: `< ${effectiveLow}`, status: "AIが下準備します" },
    {
      name: "分割を提案する",
      range: `${effectiveLow}-${effectiveHigh}`,
      status: "分割案を表示します",
    },
    { name: "分割を優先する", range: `> ${effectiveHigh}`, status: "確認後に分割します" },
  ];

  const fetchThresholds = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setThresholds({ low: 35, high: 70 });
      setDirty(false);
      return;
    }
    try {
      const res = await apiFetch("/api/automation");
      if (!res.ok) {
        toast.error("AI自動化の設定を読み込めませんでした。");
        return;
      }
      const data = await res.json();
      setThresholds({
        low: data.low ?? 35,
        high: data.high ?? 70,
        stage: data.stage ?? 0,
        effectiveLow: data.effectiveLow ?? data.low ?? 35,
        effectiveHigh: data.effectiveHigh ?? data.high ?? 70,
      });
      setDirty(false);
    } catch {
      toast.error("AI自動化の設定を読み込めませんでした。");
    }
  }, [ready, workspaceId, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchThresholds();
  }, [fetchThresholds]);

  const saveThresholds = async () => {
    const res = await apiFetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(thresholds),
    });
    // Keep dirty on failure so the unsaved change stays visible.
    if (!res.ok) {
      toast.error("AI自動化の設定を保存できませんでした。");
      return;
    }
    setDirty(false);
    toast.success("AI自動化の設定を保存しました。");
  };

  const resetStage = async () => {
    const res = await apiFetch("/api/automation", {
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
      toast.success("自動化レベルをリセットしました。");
    } else {
      toast.error("自動化レベルをリセットできませんでした。");
    }
  };

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs text-slate-500">{NAV_LABELS.automation}</p>
            <h1 className="text-3xl font-semibold text-slate-900">AI自動化</h1>
            <p className="text-sm text-slate-600">
              タスクの内容に応じて、AIが下準備や分割案を提示する境界値を設定します。
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="grid gap-1 text-xs text-slate-600">
              AIに任せる上限
              <input
                type="number"
                value={thresholds.low}
                onChange={(e) => {
                  setThresholds((p) => ({ ...p, low: Number(e.target.value) || 0 }));
                  setDirty(true);
                }}
                className="w-24 border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-600">
              分割を優先する下限
              <input
                type="number"
                value={thresholds.high}
                onChange={(e) => {
                  setThresholds((p) => ({ ...p, high: Number(e.target.value) || 0 }));
                  setDirty(true);
                }}
                className="w-24 border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
              />
            </label>
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
            自動化レベル {thresholds.stage ?? 0}
          </span>
          <span className="border border-slate-200 bg-slate-50 px-2 py-1">
            有効しきい値 {effectiveLow} / {effectiveHigh}
          </span>
          <ConfirmDialog
            title="自動化レベルをリセットしますか？"
            description="学習によって調整された境界値を初期状態に戻します。"
            confirmLabel="リセットする"
            onConfirm={resetStage}
            trigger={
              <button
                type="button"
                className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-[#2323eb]/60 hover:text-[#2323eb]"
              >
                自動化レベルをリセット
              </button>
            }
          />
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
              <p className="text-xs text-slate-600">{rule.status}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
