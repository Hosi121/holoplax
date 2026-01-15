import Image from "next/image";
import { Settings } from "lucide-react";

const screenMap = [
  {
    title: "Backlog intake",
    detail: "1 inbox for ideas, chores, reminders. Auto-tag and score by effort/impact.",
  },
  {
    title: "Sprint desk",
    detail: "Pick capacity in onboarding bubbles, lock scope, and auto-plan points.",
  },
  {
    title: "Velocity radar",
    detail: "Sprints, burn-downs, and a running velocity band so life work stays predictable.",
  },
  {
    title: "Automation lab",
    detail: "Low-score tasks get auto-routed; high-score items get AI-suggested splits.",
  },
];

const automationRules = [
  "Score < 35 → auto-queue to AI agents or defer to inbox",
  "Score 35-70 → suggest splits and dependencies before commit",
  "Score > 70 → break into shards; keep owner in the loop with approvals",
];

const velocityTiles = [
  { label: "Sprint velocity", value: "24 pts", sub: "steady, +3 w/w" },
  { label: "Capacity bubble", value: "12h / wk", sub: "picked in onboarding" },
  { label: "Auto-handled", value: "38%", sub: "low-score tasks closed by AI" },
];

const splitThreshold = 8;

const splitNodes = [
  {
    id: "root",
    title: "クラウド移行計画",
    points: 13,
    urgency: "中",
    risk: "中",
    detail: "8pt超えのため分解。AIが候補を提示しています。",
  },
  {
    id: "child-1",
    title: "データ同期（段階移行）",
    points: 5,
    urgency: "中",
    risk: "低",
    detail: "バッチとストリーミングを併用し、切替前に差分確認。",
  },
  {
    id: "child-2",
    title: "権限・監査ログ設計",
    points: 3,
    urgency: "中",
    risk: "中",
    detail: "IAMロールと監査ログの要件を洗い出し。",
  },
  {
    id: "child-3",
    title: "モニタリング／アラート",
    points: 2,
    urgency: "低",
    risk: "低",
    detail: "メトリクスとSLI/SLOの初期値を設定。",
  },
];

export default function Home() {
  return (
    <div className="relative isolate min-h-screen bg-white">
      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 lg:py-14">
        <div className="absolute right-6 top-6 flex items-center border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <Image
            src="/logo_holoplax.png"
            alt="Holoplax logo"
            width={96}
            height={96}
            priority
          />
        </div>

        <header className="flex flex-col gap-6 border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Agile OS for life work
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
              スプリント思考で人生タスクをさばく
            </h1>
            <p className="max-w-2xl text-base text-slate-600">
              バックログを自動で溜めて、オンボーディングでキャパ（ベロシティ）を決め、
              AIが点数を見て自動ハンドリング or 分解提案。あなたは本質に集中。
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-medium">
            <button className="bg-[#2323eb] px-4 py-2 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30">
              スプリントを始める
            </button>
            <button className="border border-slate-200 bg-slate-50 px-4 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]">
              MinIO + Docker を設定
            </button>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3 text-sm text-slate-600">
              <span className="bg-[#2323eb]/10 px-3 py-1 font-medium text-[#2323eb]">
                Backlog → Sprint → Done
              </span>
              <span className="border border-slate-200 px-3 py-1">
                AI-ready
              </span>
            </div>
            <h2 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
              タスクの自動バックログ化とスプリント計画をワンストップで。
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-slate-600">
              キャパ（ポイント）を最初に決め、低スコアはAIがさばき、高スコアは分解を提案。
              ベロシティはスプリント単位で見える化。
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {velocityTiles.map((tile) => (
                <div
                  key={tile.label}
                  className="border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <p className="text-sm text-slate-500">{tile.label}</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold text-slate-900">
                      {tile.value}
                    </span>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {tile.sub}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="border border-[#2323eb]/30 bg-[#2323eb]/10 px-3 py-1 text-[#2323eb]">
                ベロシティはスプリント単位
              </span>
              <span className="border border-slate-200 px-3 py-1">
                自動バックログ化
              </span>
              <span className="border border-slate-200 px-3 py-1">
                キャパをオンボーディングで決定
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4 border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Automation readiness</p>
              <span className="border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                AI pass / fail
              </span>
            </div>
            <div className="flex items-end gap-3">
              <div className="text-5xl font-semibold text-slate-900">74</div>
              <div className="bg-[#2323eb]/10 px-3 py-1 text-xs font-semibold text-[#2323eb]">
                ready to auto-handle
              </div>
            </div>
            <p className="text-sm text-slate-600">
              低スコアは自動で捌き、高スコアは分解してからスプリントに入れる流れを標準化。
            </p>
            <div className="space-y-2 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              {automationRules.map((rule) => (
                <div key={rule} className="flex items-start gap-2">
                  <span className="mt-[6px] h-2 w-2 bg-[#2323eb]" />
                  <span>{rule}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-slate-500">Next actions</p>
                <p className="mt-2 font-medium text-slate-900">
                  12 items queued for auto-handle
                </p>
              </div>
              <div className="border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-slate-500">Needs split</p>
                <p className="mt-2 font-medium text-slate-900">4 big items to shard</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Core screens</h3>
              <span className="border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                shadcn-inspired system UI
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {screenMap.map((screen) => (
                <div
                  key={screen.title}
                  className="group border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-[#2323eb]/60"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-slate-900">
                      {screen.title}
                    </h4>
                    <span className="text-[#2323eb] opacity-0 transition group-hover:opacity-100">
                      →
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{screen.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 bg-[#2323eb]" />
              <p className="text-sm text-slate-600">Infra for deploy</p>
            </div>
            <h3 className="text-xl font-semibold text-slate-900">
              AWS-ready with MinIO (S3) + Docker
            </h3>
            <p className="text-sm text-slate-600">
              AWSへデプロイしつつ、S3互換ストレージはMinIOに置き換え可能。Docker composeで
              安定したデリバリーを前提にする設計。
            </p>
            <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <div className="flex items-center justify-between">
                <span>Storage</span>
                <span className="bg-[#2323eb]/10 px-3 py-1 text-xs text-[#2323eb]">
                  MinIO (S3)
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Runtime</span>
                <span className="bg-white px-3 py-1 text-xs text-slate-700">
                  Docker compose ready
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Delivery</span>
                <span className="bg-white px-3 py-1 text-xs text-slate-700">
                  AWS deploy plan
                </span>
              </div>
            </div>
            <div className="border border-[#2323eb]/30 bg-[#2323eb]/10 px-4 py-3 text-sm text-slate-900">
              白と #2323eb を軸にしたシンプルなシステムUI。余白と境界線で情報を整流。
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Task flow</h3>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-500">
                plan → do → review
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {["Capture", "Commit", "Execute"].map((stage) => (
                <div
                  key={stage}
                  className="border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <p className="text-sm text-slate-500">{stage}</p>
                  <p className="mt-2 text-slate-900">
                    {stage === "Capture" &&
                      "Auto-backlog with scoring and tags from inboxes."}
                    {stage === "Commit" &&
                      "Select capacity and lock scope per sprint with points."}
                    {stage === "Execute" &&
                      "AI handles low scores; you focus on the high-impact work."}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Readiness checklist</h3>
              <span className="bg-[#2323eb]/10 px-3 py-1 text-xs text-[#2323eb]">
                onboarding bubbles
              </span>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-800">
              <div className="flex items-start gap-3 border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="mt-1 h-2 w-2 bg-[#2323eb]" />
                <div>
                  <p className="font-medium text-slate-900">
                    Set sprint length & capacity
                  </p>
                  <p className="text-slate-600">
                    Quick bubble Q&A during onboarding to lock velocity targets.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="mt-1 h-2 w-2 bg-[#2323eb]" />
                <div>
                  <p className="font-medium text-slate-900">Connect backlog sources</p>
                  <p className="text-slate-600">
                    Calendar, notes, email, chat: all funnel into the backlog as
                    structured tasks.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="mt-1 h-2 w-2 bg-[#2323eb]" />
                <div>
                  <p className="font-medium text-slate-900">AI actions & guardrails</p>
                  <p className="text-slate-600">
                    Choose what AI can auto-complete, what requires review, and when to
                    split tasks.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">タスク分解（Git風ツリー）</h3>
              <p className="text-sm text-slate-600">
                {splitThreshold}pt を超えたタスクは自動で分解候補を提示し、〇/×で採用可。
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                上限 {splitThreshold} pt
              </div>
              <button className="flex items-center gap-1 border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]">
                <Settings size={16} />
                変更
              </button>
            </div>
          </div>
          <div className="relative mt-6 pl-8">
            <div className="absolute left-3 top-0 bottom-0 border-l border-slate-200" />
            <div className="space-y-4">
              {splitNodes.map((node, idx) => (
                <div key={node.id} className="relative">
                  <div className="absolute left-[9px] top-3 h-0.5 w-4 bg-slate-300" />
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 items-center justify-center bg-[#2323eb]/10 text-xs font-semibold text-[#2323eb]">
                      {node.points}
                    </div>
                    <div className="flex-1 border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">
                          {node.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
                            緊急度: {node.urgency}
                          </span>
                          <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
                            リスク: {node.risk}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{node.detail}</p>
                      {idx === 0 ? (
                        <div className="mt-3 flex items-center gap-2 text-xs">
                          <span className="border border-[#2323eb]/40 bg-[#2323eb]/10 px-2 py-1 text-[#2323eb]">
                            分解提案
                          </span>
                          <span className="text-slate-600">
                            上限 {splitThreshold}pt を超過したため分解候補を生成
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
