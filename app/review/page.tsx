import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ListTodo,
  Timer,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace-context";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

import { EmptyState } from "../components/empty-state";
import { FocusQueue } from "../components/focus-queue";
import { HelpTooltip } from "../components/help-tooltip";
import { InboxWidget } from "../components/inbox-widget";
import { QuickStartCard } from "../components/quick-start-card";

const splitThreshold = 8;

const formatPercent = (value: number) => `${Math.round(value)}%`;
const formatDays = (value: number) => `${value.toFixed(1)} 日`;
export default async function ReviewPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const workspaceId = userId ? await resolveWorkspaceId(userId) : null;

  const [sprint, tasks, velocityEntries, openDependencies] = workspaceId
    ? await Promise.all([
        prisma.sprint.findFirst({
          where: { workspaceId, status: "ACTIVE" },
          orderBy: { startedAt: "desc" },
        }),
        prisma.task.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 1000,
        }),
        prisma.velocityEntry.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 7,
        }),
        prisma.taskDependency.count({
          where: {
            task: { workspaceId },
            dependsOn: { status: { not: "DONE" } },
          },
        }),
      ])
    : [null, [], [], 0];

  // Single pass to collect all sprint-related metrics
  const sprintMetrics = (() => {
    const sprintTasks: typeof tasks = [];
    const sprintDone: typeof tasks = [];
    const sprintActive: typeof tasks = [];
    const sprintPbis: typeof tasks = [];
    const sprintPbiDone: typeof tasks = [];
    let committedPoints = 0;
    let totalSprintPoints = 0;
    let donePoints = 0;

    for (const task of tasks) {
      const isSprintTask = sprint
        ? task.sprintId === sprint.id || task.status === "SPRINT"
        : task.status === "SPRINT";

      if (!isSprintTask) continue;

      sprintTasks.push(task);
      totalSprintPoints += task.points;

      if (task.status === "DONE") {
        sprintDone.push(task);
        donePoints += task.points;
      } else {
        sprintActive.push(task);
        committedPoints += task.points;
      }

      if (task.type === "PBI") {
        sprintPbis.push(task);
        if (task.status === "DONE") {
          sprintPbiDone.push(task);
        }
      }
    }

    const pbiCompletionRate = sprintPbis.length
      ? (sprintPbiDone.length / sprintPbis.length) * 100
      : 0;
    const completionRate = totalSprintPoints ? (donePoints / totalSprintPoints) * 100 : 0;

    return {
      sprintTasks,
      sprintDone,
      sprintActive,
      sprintPbis,
      sprintPbiDone,
      committedPoints,
      totalSprintPoints,
      pbiCompletionRate,
      completionRate,
    };
  })();

  const {
    sprintTasks,
    sprintDone,
    sprintActive,
    sprintPbis,
    sprintPbiDone,
    committedPoints,
    totalSprintPoints,
    pbiCompletionRate,
    completionRate,
  } = sprintMetrics;

  const doneTasks = tasks.filter((task) => task.status === "DONE");
  const leadTimeSample = doneTasks.slice(0, 5);
  const leadTimeDays =
    leadTimeSample.length > 0
      ? leadTimeSample.reduce((sum, task) => {
          const created = task.createdAt ? new Date(task.createdAt).getTime() : 0;
          const updated = task.updatedAt ? new Date(task.updatedAt).getTime() : created;
          return sum + Math.max(0, updated - created);
        }, 0) /
        leadTimeSample.length /
        (1000 * 60 * 60 * 24)
      : null;

  const velocitySeries = velocityEntries.length
    ? velocityEntries.map((entry) => entry.points).reverse()
    : [];

  const hasBurndown = totalSprintPoints > 0;
  const burndownSeries = (() => {
    if (!hasBurndown || !sprint?.startedAt) return [];
    const days = 7;
    const start = new Date(sprint.startedAt);
    const dailyDone = Array.from({ length: days }, () => 0);
    sprintDone.forEach((task) => {
      const doneAt = task.updatedAt ? new Date(task.updatedAt) : null;
      if (!doneAt) return;
      const diff = Math.floor((doneAt.getTime() - start.getTime()) / MS_PER_DAY);
      if (diff >= 0 && diff < days) {
        dailyDone[diff] += task.points;
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
      label: "高スコア",
      value: backlogTasks.filter((task) => task.points > splitThreshold).length,
      accent: "bg-red-100 text-red-700",
    },
    {
      label: "分解待ち",
      value: backlogTasks.filter((task) => task.points > splitThreshold).length,
      accent: "bg-amber-100 text-amber-700",
    },
    {
      label: "低スコア",
      value: backlogTasks.filter((task) => task.points <= 3).length,
      accent: "bg-emerald-100 text-emerald-700",
    },
  ];

  const recentActivity = tasks.length
    ? tasks.slice(0, 4).map((task) => {
        if (task.status === "DONE") return `完了: ${task.title}`;
        if (task.status === "SPRINT") return `スプリントに「${task.title}」を追加`;
        return `バックログ追加: ${task.title}`;
      })
    : [];

  const now = new Date();
  const prevVelocity = velocitySeries.at(-2) ?? velocitySeries.at(-1) ?? 0;
  const reviewDate = sprint?.startedAt ? new Date(sprint.startedAt) : null;
  if (reviewDate) {
    reviewDate.setDate(reviewDate.getDate() + 7);
  }
  const reviewLabel = reviewDate
    ? `${reviewDate.toLocaleDateString("ja-JP", { weekday: "short" })} 18:00`
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
      label: "今週のコミット",
      value: `${committedPoints} pt`,
      delta: `${committedPoints - (prevVelocity ?? 0) >= 0 ? "+" : ""}${
        committedPoints - (prevVelocity ?? 0)
      }`,
      icon: ListTodo,
      arrowDir: committedPoints - (prevVelocity ?? 0) >= 0 ? "positive" : "negative",
    },
    {
      label: "完了率",
      value: formatPercent(completionRate),
      delta: null,
      icon: CheckCircle2,
      arrowDir: "positive",
    },
    {
      label: "平均リードタイム",
      value: leadTimeDays !== null ? formatDays(leadTimeDays) : "—",
      delta: null,
      icon: Timer,
      arrowDir: "positive",
    },
    {
      label: "次のレビュー",
      value: reviewLabel,
      delta: reviewEta,
      icon: CalendarDays,
      arrowDir: "positive",
    },
    {
      label: "PBI消化",
      value: `${sprintPbiDone.length}/${sprintPbis.length}`,
      delta: `${Math.round(pbiCompletionRate)}%`,
      icon: CheckCircle2,
      arrowDir: "positive",
    },
  ];

  const velocityMax = velocitySeries.length ? Math.max(...velocitySeries) : 0;
  const burndownMax = burndownSeries.length ? Math.max(...burndownSeries) : 0;

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Dashboard
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">スプリントの今が一目でわかる</h1>
            <p className="text-sm text-slate-600">
              タスクの流れ、ベロシティ、消化ペースを集約。次の一手を迷わない。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="border border-slate-200 bg-white px-3 py-1 text-slate-700">
              スプリント: {sprint?.name ?? "未開始"}
            </span>
            <span className="border border-[#2323eb]/40 bg-[#2323eb]/10 px-3 py-1 text-[#2323eb]">
              AI ready
            </span>
            <Link
              href="/backlog"
              className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              Planへ戻る
            </Link>
          </div>
        </div>
      </header>

      <QuickStartCard />

      <section className="grid gap-4 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{kpi.label}</p>
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
        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">ベロシティ推移</h2>
              <HelpTooltip text="過去のスプリントで完了したポイント数の推移です。安定するほど計画精度が上がります。" />
            </span>
            <span className="text-xs text-slate-500">直近7スプリント</span>
          </div>
          {velocitySeries.length ? (
            <>
              <div className="mt-4 grid grid-cols-7 items-end gap-2">
                {velocitySeries.map((value, idx) => (
                  <div key={`velocity-${idx}`} className="flex flex-col items-center gap-2">
                    <div
                      className="w-full rounded-sm bg-[#2323eb]/20"
                      style={{
                        height: `${(value / velocityMax) * 120 + 12}px`,
                      }}
                    />
                    <span className="text-[10px] text-slate-500">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs text-slate-600">
                <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                  平均{" "}
                  {Math.round(velocitySeries.reduce((a, b) => a + b, 0) / velocitySeries.length)} pt
                </span>
                <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                  最高 {Math.max(...velocitySeries)} pt
                </span>
              </div>
            </>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="ベロシティデータがありません"
              description={
                sprint
                  ? "スプリントを完了するとベロシティが記録されます。"
                  : "スプリントを開始して完了すると自動で記録されます。"
              }
              actionLabel={sprint ? "スプリントを確認" : "スプリントを始める"}
              actionHref="/sprint"
            />
          )}
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">バーンダウン</h2>
            <span className="text-xs text-slate-500">7日間</span>
          </div>
          {burndownSeries.length ? (
            <>
              <div className="mt-4">
                <svg viewBox="0 0 240 120" className="h-32 w-full">
                  <defs>
                    <linearGradient id="burn-gradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#2323eb" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2323eb" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
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
                  <polygon
                    fill="url(#burn-gradient)"
                    points={`10,110 ${burndownSeries
                      .map((value, idx) => {
                        const x = (idx / (burndownSeries.length - 1)) * 220 + 10;
                        const y = 110 - (value / burndownMax) * 90;
                        return `${x},${y}`;
                      })
                      .join(" ")} 230,110`}
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
              icon={TrendingDown}
              title="バーンダウンはまだありません"
              description={
                sprint
                  ? "タスクを完了していくとバーンダウンが表示されます。"
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
            <h2 className="text-lg font-semibold text-slate-900">バックログ状況</h2>
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
              <p className="text-xs text-slate-500">キャパ使用率</p>
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
          <p className="mt-3 text-xs text-slate-500">
            直近は高スコアが増加。分解提案の優先度を上げると回転が速くなります。
          </p>
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">最近のアクティビティ</h2>
            <span className="text-xs text-slate-500">直近24時間</span>
          </div>
          {recentActivity.length ? (
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              {recentActivity.map((item, idx) => (
                <div
                  key={`${item}-${idx}`}
                  className="flex items-start gap-3 border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#2323eb]" />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Activity}
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
