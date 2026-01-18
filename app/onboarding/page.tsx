"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type IntentOption = {
  id: string;
  title: string;
  summary: string;
};

const intents: IntentOption[] = [
  { id: "personal", title: "個人の挑戦", summary: "自分の夢や目標を形にする" },
  { id: "team", title: "チームの航海", summary: "仲間とリズムを揃えて進める" },
  { id: "learning", title: "学びの旅", summary: "習慣を積み重ねて成長する" },
  { id: "product", title: "事業の航路", summary: "成果へ向けた最短ルートを描く" },
];

const prepExamples = {
  CHECKLIST: "- 目的と完了条件を整理\n- 必要な資料を準備\n- 依存タスクを確認\n- 実行\n- 共有",
  IMPLEMENTATION: "1. 影響範囲を洗い出す\n2. 変更方針を決定\n3. 実装\n4. テスト\n5. 振り返り",
  EMAIL: "件名: 進捗共有\n\n関係者各位\n\n現在の状況を共有します。\n- 進捗\n- 次のアクション\n- 期限\n\nよろしくお願いします。",
};

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<string>("personal");
  const [workspaceName, setWorkspaceName] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [points, setPoints] = useState(3);
  const [routineTitle, setRoutineTitle] = useState("");
  const [routineCadence, setRoutineCadence] = useState("DAILY");
  const [routineDescription, setRoutineDescription] = useState("");
  const [focusTasks, setFocusTasks] = useState<string[]>(["", "", ""]);
  const [prepType, setPrepType] = useState<"CHECKLIST" | "IMPLEMENTATION" | "EMAIL">(
    "CHECKLIST",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storyPoints = [1, 2, 3, 5, 8, 13, 21, 34];

  const canNext = useMemo(() => {
    if (step === 0) return workspaceName.trim().length > 1 && Boolean(intent);
    if (step === 1) return goalTitle.trim().length > 1 && routineTitle.trim().length > 1;
    if (step === 2) return focusTasks.some((task) => task.trim().length > 1);
    return true;
  }, [step, intent, workspaceName, goalTitle, routineTitle, focusTasks]);

  const goNext = async () => {
    if (!canNext) return;
    if (step < 3) {
      setStep((prev) => prev + 1);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          workspaceName: workspaceName.trim(),
          goalTitle: goalTitle.trim(),
          goalDescription: goalDescription.trim(),
          points,
          routineTitle: routineTitle.trim(),
          routineDescription: routineDescription.trim(),
          routineCadence,
          focusTasks: focusTasks.map((task) => task.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "オンボーディングに失敗しました。");
        return;
      }
      const completedAt = new Date().toISOString();
      await update({ user: { onboardingCompletedAt: completedAt } });
      router.push("/backlog");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#f1f5f9_45%,_#e2e8f0_100%)] px-4 py-10 text-slate-900">
      <div className="mx-auto grid w-full max-w-4xl gap-8">
        <header className="grid gap-3 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
            Journey Setup
          </p>
          <h1 className="text-3xl font-semibold">旅の始まりを描こう</h1>
          <p className="text-sm text-slate-600">
            Plan → Execute → Review を回すための下準備を整えます。
          </p>
        </header>

        <div className="border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.6)]">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Chapter {step + 1} / 4</span>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={`h-1 w-10 ${step >= index ? "bg-[#2323eb]" : "bg-slate-200"}`}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-6">
            {step === 0 ? (
              <div className="grid gap-4">
                <h2 className="text-xl font-semibold">目的と宇宙の名前</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {intents.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setIntent(option.id)}
                      className={`border px-4 py-4 text-left transition ${
                        intent === option.id
                          ? "border-[#2323eb] bg-[#2323eb]/10 text-[#2323eb]"
                          : "border-slate-200 bg-white hover:border-[#2323eb]/40"
                      }`}
                    >
                      <p className="text-sm font-semibold">{option.title}</p>
                      <p className="mt-2 text-xs text-slate-600">{option.summary}</p>
                    </button>
                  ))}
                </div>
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="宇宙の名前（例: Holoplax Launch）"
                  className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-4">
                <h2 className="text-xl font-semibold">目標とルーティン</h2>
                <p className="text-sm text-slate-600">
                  いま一番大切な目標と、毎日/毎週回したいルーティンを設定します。
                </p>
                <div className="grid gap-2">
                  <input
                    value={goalTitle}
                    onChange={(event) => setGoalTitle(event.target.value)}
                    placeholder="目標（例: 新しいサービスのLPを整える）"
                    className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                  <textarea
                    value={goalDescription}
                    onChange={(event) => setGoalDescription(event.target.value)}
                    placeholder="目標の補足"
                    rows={3}
                    className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                  <label className="grid gap-2 text-xs text-slate-500">
                    目標の粒度
                    <select
                      value={points}
                      onChange={(event) => setPoints(Number(event.target.value) || 1)}
                      className="border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                    >
                      {storyPoints.map((pt) => (
                        <option key={pt} value={pt}>
                          {pt} pt
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-2">
                  <input
                    value={routineTitle}
                    onChange={(event) => setRoutineTitle(event.target.value)}
                    placeholder="ルーティン（例: 朝のレビュー）"
                    className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                  <textarea
                    value={routineDescription}
                    onChange={(event) => setRoutineDescription(event.target.value)}
                    placeholder="ルーティンの補足"
                    rows={2}
                    className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                  <label className="grid gap-2 text-xs text-slate-500">
                    ルーティン周期
                    <select
                      value={routineCadence}
                      onChange={(event) => setRoutineCadence(event.target.value)}
                      className="border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                    >
                      <option value="DAILY">毎日</option>
                      <option value="WEEKLY">毎週</option>
                    </select>
                  </label>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4">
                <h2 className="text-xl font-semibold">やるべきこと3件</h2>
                <p className="text-sm text-slate-600">
                  直近で取り組みたいタスクを3件まで入力します。
                </p>
                <div className="grid gap-2">
                  {focusTasks.map((task, index) => (
                    <input
                      key={index}
                      value={task}
                      onChange={(event) =>
                        setFocusTasks((prev) =>
                          prev.map((item, idx) => (idx === index ? event.target.value : item)),
                        )
                      }
                      placeholder={`フォーカスタスク ${index + 1}`}
                      className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4">
                <h2 className="text-xl font-semibold">AI下準備プレビュー</h2>
                <p className="text-sm text-slate-600">
                  AIが出力する下準備の例を確認します。承認→適用でタスクに反映されます。
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["CHECKLIST", "IMPLEMENTATION", "EMAIL"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setPrepType(type)}
                      className={`border px-3 py-2 text-xs transition ${
                        prepType === type
                          ? "border-[#2323eb] bg-[#2323eb]/10 text-[#2323eb]"
                          : "border-slate-200 bg-white hover:border-[#2323eb]/40"
                      }`}
                    >
                      {type === "CHECKLIST"
                        ? "チェックリスト"
                        : type === "IMPLEMENTATION"
                          ? "実装手順"
                          : "メール草案"}
                    </button>
                  ))}
                </div>
                <pre className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {prepExamples[prepType]}
                </pre>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            disabled={step === 0}
          >
            戻る
          </button>
          <button
            onClick={goNext}
            disabled={!canNext || saving}
            className="bg-[#2323eb] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30 disabled:opacity-60"
          >
            {saving ? "準備中..." : step < 3 ? "次へ" : "旅を始める"}
          </button>
        </div>
      </div>
    </div>
  );
}
