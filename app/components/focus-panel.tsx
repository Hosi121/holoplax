"use client";

import { Check, RefreshCw, Target } from "lucide-react";
import { InlineError, Skeleton } from "./ui/feedback";
import { useDailyFocus } from "./use-daily-focus";

export function FocusPanel() {
  const { focusTasks, summary, loading, error, refresh, markDone } = useDailyFocus();

  if (loading) {
    return (
      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <Skeleton className="h-20 w-full" />
      </section>
    );
  }

  if (error) {
    return <InlineError message={error} onRetry={refresh} />;
  }

  if (focusTasks.length === 0) {
    return (
      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <Target size={16} />
          <span className="text-sm">今やるべきタスクはありません</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">スプリントにタスクを追加してください</p>
      </section>
    );
  }

  return (
    <section className="border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-[#2323eb]" />
          <h2 className="text-lg font-semibold text-slate-900">今やること</h2>
          <span className="text-sm text-slate-500">{summary}</span>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-700"
        >
          <RefreshCw size={12} />
          更新
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {focusTasks.map(({ task, reasons }) => (
          <div
            key={task.id}
            className="flex items-center gap-3 border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300"
          >
            <button
              onClick={() => markDone(task.id)}
              className="flex size-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-400 hover:border-[#2323eb] hover:text-[#2323eb]"
              aria-label={`「${task.title}」を完了にする`}
            >
              <Check size={12} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {task.points}pt
                </span>
                {reasons.map((reason) => (
                  <span
                    key={reason}
                    className="inline-flex items-center rounded bg-[#2323eb]/10 px-1.5 py-0.5 text-[10px] text-[#2323eb]"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
