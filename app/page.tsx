import { ArrowRight, BarChart3, CheckCircle2, Zap } from "lucide-react";
import { Sidebar } from "./components/sidebar";

const highlights = [
  {
    label: "バックログ",
    value: "自動で貯まる",
    desc: "アイデア/メモ/メールをスコア付きで整理",
  },
  {
    label: "スプリント",
    value: "容量でロック",
    desc: "ポイントでキャパを決め、コミットを固定",
  },
  {
    label: "ベロシティ",
    value: "24 pt",
    desc: "直近スプリントのレンジと推移を可視化",
  },
];

const flow = [
  { title: "Capture", detail: "ひとまず全部インボックスへ。AIが点数とタグを付与。" },
  { title: "Commit", detail: "スプリント容量を決め、点数に応じて自動/分解を振り分け。" },
  { title: "Execute", detail: "低スコアは自動処理、高スコアは分割して着手。" },
];

const thresholds = [
  { range: "< 35", label: "自動で捌く", icon: Zap },
  { range: "35-70", label: "分解と依存チェック", icon: CheckCircle2 },
  { range: "> 70", label: "分割してレビュー", icon: BarChart3 },
];

const splitThreshold = 8;

export default function Home() {
  return (
    <div className="relative isolate min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-6xl gap-6 px-4 py-12 lg:px-6">
        <Sidebar splitThreshold={splitThreshold} />

        <div className="flex flex-1 flex-col gap-10">
          <header className="border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Agile OS for life work
                </p>
                <h1 className="text-4xl font-semibold leading-tight text-slate-900">
                  スプリントで回す人生タスク
                </h1>
                <p className="max-w-2xl text-base text-slate-600">
                  バックログを自動で集めてスコア化。容量に合わせてコミットを固定し、
                  点数に応じて自動処理と分解を振り分けます。
                </p>
                <div className="flex flex-wrap gap-3 text-sm font-medium">
                  <button className="bg-[#2323eb] px-4 py-2 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30">
                    今すぐスプリントを切る
                  </button>
                  <button className="flex items-center gap-1 border border-slate-200 bg-slate-50 px-4 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]">
                    使い方を見る
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
              <div className="grid w-full max-w-sm gap-3 border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Snapshot</p>
                <div className="grid grid-cols-2 gap-3">
                  {highlights.map((item) => (
                    <div key={item.label} className="border border-slate-200 bg-white px-3 py-2">
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p className="text-lg font-semibold text-slate-900">{item.value}</p>
                      <p className="text-[11px] text-slate-600">{item.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border border-slate-200 bg-white px-3 py-2">
                  <div>
                    <p className="text-xs text-slate-500">自動化しきい値</p>
                    <p className="text-sm font-semibold text-slate-900">上限 {splitThreshold} pt</p>
                  </div>
                  <span className="bg-[#2323eb]/10 px-3 py-1 text-xs font-semibold text-[#2323eb]">
                    AI ready
                  </span>
                </div>
              </div>
            </div>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">流れをシンプルに</h3>
                <span className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  capture → commit → execute
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {flow.map((item) => (
                  <div key={item.title} className="border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">点数で挙動を決める</h3>
                <span className="bg-[#2323eb]/10 px-3 py-1 text-xs text-[#2323eb]">
                  分割しきい値 {splitThreshold} pt
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {thresholds.map((rule) => (
                  <div key={rule.range} className="border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center gap-2">
                      <rule.icon size={16} className="text-[#2323eb]" />
                      <p className="text-sm font-semibold text-slate-900">{rule.range}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{rule.label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                低スコアは自動、境界は分解提案、高スコアは分割とレビューを標準化。
              </p>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">バックログとスプリント</h3>
                <span className="border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                  AI-ready
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                バックログを自動で貯め、スプリント容量に合わせて送るだけ。
                緊急度・リスクのタグ付きで、そのままポイント管理。
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs text-slate-500">Backlog</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">AIが下準備</p>
                  <p className="text-sm text-slate-600">重複チェックと分解提案を自動で提示。</p>
                </div>
                <div className="border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs text-slate-500">Sprint</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">容量ロック</p>
                  <p className="text-sm text-slate-600">残ポイントを見ながらコミットを固定。</p>
                </div>
              </div>
            </div>

            <div className="border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">ベロシティのざっくり可視化</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {["Sprint-10", "Sprint-11", "Sprint-12"].map((sprint) => (
                  <div
                    key={sprint}
                    className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                  >
                    <p className="text-slate-500">{sprint}</p>
                    <p className="text-2xl font-semibold text-slate-900">22 pt</p>
                    <p className="text-xs text-slate-500">レンジ: 20-26</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                スプリント履歴とレンジを軽く表示。実データ連携で精度を高めていきます。
              </p>
            </div>
          </section>

          <section className="border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">インフラ前提</h3>
                <p className="text-sm text-slate-600">
                  Docker compose で Postgres + MinIO を起動。Next はホストで動かすだけ。
                </p>
              </div>
              <span className="bg-[#2323eb]/10 px-3 py-1 text-xs font-semibold text-[#2323eb]">
                AWS ready
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm text-slate-800">
              <div className="border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-slate-500">Storage</p>
                <p className="mt-2 font-semibold text-slate-900">MinIO (S3互換)</p>
              </div>
              <div className="border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-slate-500">Database</p>
                <p className="mt-2 font-semibold text-slate-900">Postgres</p>
              </div>
              <div className="border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-slate-500">Runtime</p>
                <p className="mt-2 font-semibold text-slate-900">Next.js 16</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
