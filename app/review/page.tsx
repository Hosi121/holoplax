import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ListTodo,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AUTOMATION_STATUS, SEVERITY } from "@/lib/types";
import { resolveWorkspaceId } from "@/lib/workspace-context";
import { getReviewSnapshot } from "@/modules/review/index.server";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

import { EmptyState } from "../components/empty-state";
import { FocusQueue } from "../components/focus-queue";
import { HelpTooltip } from "../components/help-tooltip";
import { InboxWidget } from "../components/inbox-widget";
import { QuickStartCard } from "../components/quick-start-card";

const formatPercent = (value: number) => `${Math.round(value)}%`;
const formatDays = (value: number) => `${value.toFixed(1)} 日`;
export default async function ReviewPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const workspaceId = userId ? await resolveWorkspaceId(userId) : null;
  // React's render-purity rule rejects Date.now() here; an explicit Date keeps
  // the server-render snapshot stable for this invocation.
  // biome-ignore lint/complexity/useDateNow: see purity rationale above
  const activitySince = new Date(new Date().getTime() - MS_PER_DAY);

  const snapshot =
    userId && workspaceId
      ? await getReviewSnapshot(userId, workspaceId, activitySince)
      : {
          activeSprint: null,
          latestClosedSprint: null,
          tasks: [],
          velocityEntries: [],
          openDependencies: 0,
          activity: [],
          automation: null,
        };
  const {
    activeSprint,
    latestClosedSprint,
    tasks,
    velocityEntries,
    openDependencies,
    activity,
    automation,
  } = snapshot;
  const sprint = activeSprint ?? latestClosedSprint;
  const doneAt = (task: (typeof tasks)[number]) => task.workflowEvents[0]?.createdAt ?? null;

  // Single pass to collect all sprint-related metrics
  const sprintMetrics = (() => {
    const scopedItems =
      sprint?.items.filter((item) => sprint.endedAt !== null || item.removedAt === null) ?? [];
    const sprintDone = scopedItems.filter((item) => item.outcome === "COMPLETED");
    const sprintPbis = scopedItems.filter((item) => item.taskType === "PBI");
    const sprintPbiDone = sprintPbis.filter((item) => item.outcome === "COMPLETED");
    let totalSprintPoints = 0;
    let donePoints = 0;

    for (const item of scopedItems) {
      totalSprintPoints += item.committedPoints;
      if (item.outcome === "COMPLETED") donePoints += item.committedPoints;
    }

    const pbiCompletionRate = sprintPbis.length
      ? (sprintPbiDone.length / sprintPbis.length) * 100
      : 0;
    const completionRate = totalSprintPoints ? (donePoints / totalSprintPoints) * 100 : 0;

    return {
      sprintDone,
      sprintPbis,
      sprintPbiDone,
      totalSprintPoints,
      pbiCompletionRate,
      completionRate,
    };
  })();

  const {
    sprintDone,
    sprintPbis,
    sprintPbiDone,
    totalSprintPoints,
    pbiCompletionRate,
    completionRate,
  } = sprintMetrics;

  const leadTimeSample = tasks
    .filter((task) => doneAt(task) !== null)
    .sort((a, b) => (doneAt(b)?.getTime() ?? 0) - (doneAt(a)?.getTime() ?? 0))
    .slice(0, 5);
  const leadTimeDays =
    leadTimeSample.length > 0
      ? leadTimeSample.reduce((sum, task) => {
          const created = task.createdAt ? new Date(task.createdAt).getTime() : 0;
          const completed = doneAt(task)?.getTime() ?? created;
          return sum + Math.max(0, completed - created);
        }, 0) /
        leadTimeSample.length /
        (1000 * 60 * 60 * 24)
      : null;

  const velocitySeries = velocityEntries.map((entry) => ({
    id: entry.id,
    points: entry.points,
  }));
  velocitySeries.reverse();
  const velocityValues = velocitySeries.map((entry) => entry.points);

  const hasBurndown = totalSprintPoints > 0;
  const burndownSeries = (() => {
    if (!hasBurndown || !sprint?.startedAt) return [];
    const start = new Date(sprint.startedAt);
    const plannedEnd = sprint.plannedEndAt
      ? new Date(sprint.plannedEndAt)
      : sprint.endedAt
        ? new Date(sprint.endedAt)
        : new Date(start.getTime() + 7 * MS_PER_DAY);
    const days = Math.max(
      2,
      Math.min(31, Math.ceil((plannedEnd.getTime() - start.getTime()) / MS_PER_DAY) + 1),
    );
    const dailyDone = Array.from({ length: days }, () => 0);
    sprintDone.forEach((task) => {
      const completedAt = task.completedAt;
      if (!completedAt) return;
      const diff = Math.floor((completedAt.getTime() - start.getTime()) / MS_PER_DAY);
      if (diff >= 0 && diff < days) {
        dailyDone[diff] += task.committedPoints;
      }
    });
    let remaining = totalSprintPoints;
    return dailyDone.map((points) => {
      remaining = Math.max(0, remaining - points);
      return remaining;
    });
  })();

  const backlogTasks = tasks.filter((task) => task.status === "BACKLOG");
  const backlogSnapshot = [
    {
      label: "高優先度",
      value: backlogTasks.filter((task) => task.urgency === SEVERITY.HIGH).length,
      accent: "bg-red-100 text-red-700",
    },
    {
      label: "分解待ち",
      value: backlogTasks.filter(
        (task) => task.automationStatus === AUTOMATION_STATUS.SPLIT_PENDING,
      ).length,
      accent: "bg-amber-100 text-amber-700",
    },
    {
      label: "小タスク",
      value: backlogTasks.filter((task) => task.points <= 3).length,
      accent: "bg-emerald-100 text-emerald-700",
    },
  ];

  const recentActivity = activity.map((event) => ({
    id: event.id,
    label:
      event.toStatus === "DONE"
        ? `完了: ${event.task.title}`
        : event.toStatus === "SPRINT"
          ? `スプリントに「${event.task.title}」を追加`
          : event.fromStatus === null
            ? `やること追加: ${event.task.title}`
            : `バックログへ移動: ${event.task.title}`,
  }));

  const now = new Date();
  const prevVelocity = velocityValues.at(-2) ?? velocityValues.at(-1) ?? 0;
  const reviewDate = sprint?.plannedEndAt
    ? new Date(sprint.plannedEndAt)
    : sprint?.endedAt
      ? new Date(sprint.endedAt)
      : sprint?.startedAt
        ? new Date(new Date(sprint.startedAt).getTime() + 7 * MS_PER_DAY)
        : null;
  const reviewLabel = reviewDate
    ? reviewDate.toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "未設定";
  const reviewEta =
    reviewDate && reviewDate.getTime() > now.getTime()
      ? `${Math.round((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60))}h`
      : null;

  const kpis: {
    label: string;
    value: string;
    delta: string | null;
    icon: typeof ListTodo;
    arrowDir: "positive" | "negative";
  }[] = [
    {
      label: "計画ポイント",
      value: `${totalSprintPoints} pt`,
      delta: `${totalSprintPoints - (prevVelocity ?? 0) >= 0 ? "+" : ""}${
        totalSprintPoints - (prevVelocity ?? 0)
      }`,
      icon: ListTodo,
      arrowDir: totalSprintPoints - (prevVelocity ?? 0) >= 0 ? "positive" : "negative",
    },
    {
      label: "完了率",
      value: formatPercent(completionRate),
      delta: null,
      icon: CheckCircle2,
      arrowDir: "positive",
    },
    {
      label: "平均完了日数",
      value: leadTimeDays !== null ? formatDays(leadTimeDays) : "—",
      delta: null,
      icon: Timer,
      arrowDir: "positive",
    },
    {
      label: "次の振り返り",
      value: reviewLabel,
      delta: reviewEta,
      icon: CalendarDays,
      arrowDir: "positive",
    },
    {
      label: "やること完了",
      value: `${sprintPbiDone.length}/${sprintPbis.length}`,
      delta: `${Math.round(pbiCompletionRate)}%`,
      icon: CheckCircle2,
      arrowDir: "positive",
    },
  ];

  const velocityMax = velocityValues.length ? Math.max(...velocityValues) : 0;
  const burndownMax = burndownSeries.length ? Math.max(...burndownSeries, 1) : 1;
  const splitThreshold = Math.max(1, Math.ceil((automation?.high ?? 70) / 9));

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">振り返り</p>
            <h1 className="text-3xl font-semibold text-slate-900">今回の進み方を振り返る</h1>
            <p className="text-sm text-slate-600">
              完了したことと残ったことを確認し、次に進める内容を決めます。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="border border-slate-200 bg-white px-3 py-1 text-slate-700">
              スプリント: {sprint?.name ?? "未開始"}
            </span>
            <Link
              href="/backlog"
              className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              やることへ
            </Link>
          </div>
        </div>
      </header>

      <QuickStartCard />

      <section className="grid gap-4 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-slate-500">{kpi.label}</p>
              <kpi.icon size={16} className="text-slate-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-900">{kpi.value}</p>
              {kpi.delta ? (
                <span
                  className={`flex items-center gap-1 text-xs ${
                    kpi.arrowDir === "negative" ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {kpi.delta.startsWith("-") ? (
                    <ArrowDownRight size={12} />
                  ) : (
                    <ArrowUpRight size={12} />
                  )}
                  {kpi.delta}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <FocusQueue />

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div id="completion-pace" className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">完了ペース</h2>
              <HelpTooltip text="過去のスプリントで完了したポイント数の推移です。安定するほど計画精度が上がります。" />
            </span>
            <span className="text-xs text-slate-500">直近7回</span>
          </div>
          {velocitySeries.length ? (
            <>
              <div className="mt-4 grid grid-cols-7 items-end gap-2">
                {velocitySeries.map((entry) => (
                  <div key={entry.id} className="flex flex-col items-center gap-2">
                    <div
                      className="w-full rounded-sm bg-[#2323eb]/20"
                      style={{
                        height: `${velocityMax > 0 ? (entry.points / velocityMax) * 120 + 12 : 12}px`,
                      }}
                    />
                    <span className="text-[10px] text-slate-500">{entry.points}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs text-slate-600">
                <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                  平均{" "}
                  {Math.round(velocityValues.reduce((a, b) => a + b, 0) / velocityValues.length)} pt
                </span>
                <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                  最高 {Math.max(...velocityValues)} pt
                </span>
              </div>
            </>
          ) : (
            <EmptyState
              icon="BarChart3"
              title="完了ペースの記録がありません"
              description={
                sprint
                  ? "スプリントを完了すると完了ポイントが記録されます。"
                  : "スプリントを開始して完了すると自動で記録されます。"
              }
              actionLabel={sprint ? "スプリントを確認" : "スプリントを始める"}
              actionHref="/sprint"
            />
          )}
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">残りポイント</h2>
            <span className="text-xs text-slate-500">{burndownSeries.length}日間</span>
          </div>
          {burndownSeries.length ? (
            <>
              <div className="mt-4">
                <svg viewBox="0 0 240 120" className="h-32 w-full">
                  <polyline
                    fill="none"
                    stroke="#2323eb"
                    strokeWidth="2"
                    points={burndownSeries
                      .map((value, idx) => {
                        const x = (idx / (burndownSeries.length - 1)) * 220 + 10;
                        const y = 110 - (value / burndownMax) * 90;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                </svg>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                <Activity size={14} className="text-slate-400" />
                今週の消化ペースを確認できます
              </div>
            </>
          ) : (
            <EmptyState
              icon="TrendingDown"
              title="残りポイントの記録はまだありません"
              description={
                sprint
                  ? "タスクを完了していくと、残りポイントの推移が表示されます。"
                  : "スプリントを開始し、タスクの進行が蓄積されると表示されます。"
              }
              actionLabel={sprint ? "スプリントを確認" : "スプリントを始める"}
              actionHref="/sprint"
            />
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">やることの状況</h2>
            <span className="text-xs text-slate-500">分解しきい値 {splitThreshold} pt</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {backlogSnapshot.map((item) => (
              <div
                key={item.label}
                className="border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"
              >
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
                <span className={`mt-2 inline-flex px-2 py-1 text-[11px] ${item.accent}`}>
                  タスク
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="text-xs text-slate-500">上限ポイントの使用率</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {sprint?.capacityPoints
                  ? `${Math.min(
                      999,
                      Math.round((totalSprintPoints / sprint.capacityPoints) * 100),
                    )}%`
                  : "—"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {sprint?.capacityPoints
                  ? `${Math.max(0, sprint.capacityPoints - totalSprintPoints)} pt 余裕`
                  : "アクティブなスプリントが必要"}
              </p>
            </div>
            <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="text-xs text-slate-500">未解決依存数</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{openDependencies}</p>
              <p className="mt-1 text-[11px] text-slate-500">依存が残るタスク数の目安</p>
            </div>
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">最近のアクティビティ</h2>
            <span className="text-xs text-slate-500">直近24時間</span>
          </div>
          {recentActivity.length ? (
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              {recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <span className="mt-1 size-2 rounded-full bg-[#2323eb]" />
                  <p>{item.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="Activity"
              title="アクティビティはまだありません"
              description="タスクを追加すると履歴が表示されます。"
              actionLabel="タスクを追加"
              actionHref="/backlog"
            />
          )}
        </div>
      </section>

      <InboxWidget />
    </main>
  );
}
