import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ListTodo,
  Timer,
} from "lucide-react";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { Sidebar } from "./components/sidebar";
import { authOptions } from "../lib/auth";
import prisma from "../lib/prisma";
import { resolveWorkspaceId } from "../lib/workspace-context";

const splitThreshold = 8;

const formatPercent = (value: number) => `${Math.round(value)}%`;
const formatDays = (value: number) => `${value.toFixed(1)} 日`;

export default async function Home() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const workspaceId = userId ? await resolveWorkspaceId(userId) : null;

  const [sprint, tasks, velocityEntries] = workspaceId
    ? await Promise.all([
        prisma.sprint.findFirst({
          where: { workspaceId, status: "ACTIVE" },
          orderBy: { startedAt: "desc" },
        }),
        prisma.task.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.velocityEntry.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 7,
        }),
      ])
    : [null, [], []];

  const sprintTasks = sprint
    ? tasks.filter((task) => task.sprintId === sprint.id || task.status === "SPRINT")
    : tasks.filter((task) => task.status === "SPRINT");
  const sprintDone = sprintTasks.filter((task) => task.status === "DONE");
  const sprintActive = sprintTasks.filter((task) => task.status !== "DONE");
  const committedPoints = sprintActive.reduce((sum, task) => sum + task.points, 0);
  const totalSprintPoints = sprintTasks.reduce((sum, task) => sum + task.points, 0);
  const completionRate = totalSprintPoints
    ? (sprintDone.reduce((sum, task) => sum + task.points, 0) / totalSprintPoints) * 100
    : 0;

  const doneTasks = tasks.filter((task) => task.status === "DONE");
  const leadTimeSample = doneTasks.slice(0, 5);
  const leadTimeDays =
    leadTimeSample.length > 0
      ? leadTimeSample.reduce((sum, task) => {
          const created = task.createdAt?.getTime?.() ?? Date.now();
          const updated = task.updatedAt?.getTime?.() ?? Date.now();
          return sum + Math.max(0, updated - created);
        }, 0) /
        leadTimeSample.length /
        (1000 * 60 * 60 * 24)
      : 0;

  const velocitySeries = velocityEntries.length
    ? velocityEntries.map((entry) => entry.points).reverse()
    : [];

  const hasBurndown = totalSprintPoints > 0;
  const burndownSeries = hasBurndown
    ? Array.from({ length: 7 }, (_, idx) => {
        const delta = (totalSprintPoints - committedPoints) / 6;
        return Math.max(0, Math.round(totalSprintPoints - delta * idx));
      })
    : [];

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
    : [
        "スプリントを開始してタスクをコミットしましょう。",
        "バックログに最初のタスクを追加してください。",
        "AI分解のしきい値を設定しておくと便利です。",
        "次のレビューの準備を進めましょう。",
      ];

  const prevVelocity = velocitySeries.at(-2) ?? velocitySeries.at(-1) ?? 0;
  const reviewDate = sprint?.startedAt ? new Date(sprint.startedAt) : new Date();
  reviewDate.setDate(reviewDate.getDate() + 7);
  const reviewLabel = `${reviewDate.toLocaleDateString("ja-JP", {
    weekday: "short",
  })} 18:00`;

  const kpis = [
    {
      label: "今週のコミット",
      value: `${committedPoints} pt`,
      delta: `${committedPoints - (prevVelocity ?? 0) >= 0 ? "+" : ""}${
        committedPoints - (prevVelocity ?? 0)
      }`,
      icon: ListTodo,
    },
    {
      label: "完了率",
      value: formatPercent(completionRate),
      delta: `${completionRate >= 0 ? "+" : ""}${Math.round(completionRate - 60)}%`,
      icon: CheckCircle2,
    },
    {
      label: "平均リードタイム",
      value: formatDays(leadTimeDays || 2.4),
      delta: leadTimeDays ? `-${Math.max(0, leadTimeDays - 2).toFixed(1)}` : "-0.4",
      icon: Timer,
    },
    {
      label: "次のレビュー",
      value: reviewLabel,
      delta: "48h",
      icon: CalendarDays,
    },
  ];

  const velocityMax = velocitySeries.length ? Math.max(...velocitySeries) : 0;
  const burndownMax = burndownSeries.length ? Math.max(...burndownSeries) : 0;

  return (
    <div className="relative isolate min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-10 lg:px-6 lg:py-14">
        <Sidebar splitThreshold={splitThreshold} />

        <main className="flex-1 space-y-6">
          <header className="border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Dashboard
                </p>
                <h1 className="text-3xl font-semibold text-slate-900">
                  スプリントの今が一目でわかる
                </h1>
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
              </div>
            </div>
          </header>

          <section className="grid gap-4 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    {kpi.label}
                  </p>
                  <kpi.icon size={16} className="text-slate-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <p className="text-2xl font-semibold text-slate-900">{kpi.value}</p>
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <ArrowUpRight size={12} />
                    {kpi.delta}
                  </span>
                </div>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">ベロシティ推移</h2>
                <span className="text-xs text-slate-500">直近7スプリント</span>
              </div>
              {velocitySeries.length ? (
                <>
                  <div className="mt-4 grid grid-cols-7 items-end gap-2">
                    {velocitySeries.map((value, idx) => (
                      <div key={`velocity-${idx}`} className="flex flex-col items-center gap-2">
                        <div
                          className="w-full rounded-sm bg-[#2323eb]/20"
                          style={{ height: `${(value / velocityMax) * 120 + 12}px` }}
                        />
                        <span className="text-[10px] text-slate-500">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-3 text-xs text-slate-600">
                    <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                      平均 {Math.round(velocitySeries.reduce((a, b) => a + b, 0) / velocitySeries.length)} pt
                    </span>
                    <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                      最高 {Math.max(...velocitySeries)} pt
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">ベロシティデータがありません。</p>
                  <p className="mt-1">スプリントを開始して完了すると自動で記録されます。</p>
                  <div className="mt-3 flex gap-2 text-xs">
                    <Link
                      href="/sprint"
                      className="border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                    >
                      スプリントを始める
                    </Link>
                    <Link
                      href="/backlog"
                      className="border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                    >
                      バックログにタスク追加
                    </Link>
                  </div>
                </div>
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
                <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">バーンダウンはまだありません。</p>
                  <p className="mt-1">スプリントを開始し、タスクをコミットするとここに表示されます。</p>
                  <div className="mt-3 flex gap-2 text-xs">
                    <Link
                      href="/sprint"
                      className="border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                    >
                      スプリントを始める
                    </Link>
                    <Link
                      href="/backlog"
                      className="border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                    >
                      タスクをコミット
                    </Link>
                  </div>
                </div>
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
              <p className="mt-3 text-xs text-slate-500">
                直近は高スコアが増加。分解提案の優先度を上げると回転が速くなります。
              </p>
            </div>

            <div className="border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">最近のアクティビティ</h2>
                <span className="text-xs text-slate-500">直近24時間</span>
              </div>
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
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
