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

const cadences = [
  { id: "weekly", label: "週ごとに進める" },
  { id: "biweekly", label: "2週間で回す" },
  { id: "monthly", label: "月ごとに整える" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<string>("personal");
  const [workspaceName, setWorkspaceName] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [points, setPoints] = useState(3);
  const storyPoints = [1, 2, 3, 5, 8, 13, 21, 34];
  const storyPoints = [1, 2, 3, 5, 8, 13];
  const [cadence, setCadence] = useState("weekly");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canNext = useMemo(() => {
    if (step === 0) return Boolean(intent);
    if (step === 1) return workspaceName.trim().length > 1;
    if (step === 2) return goalTitle.trim().length > 1;
    return true;
  }, [step, intent, workspaceName, goalTitle]);

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
          cadence,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "オンボーディングに失敗しました。");
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
            たった数分で、あなたの宇宙が整います。
          </p>
        </header>

        <div className="border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.6)]">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Chapter {step + 1} / 4</span>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={`h-1 w-10 ${
                    step >= index ? "bg-[#2323eb]" : "bg-slate-200"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-6">
            {step === 0 ? (
              <div className="grid gap-4">
                <h2 className="text-xl font-semibold">なにを旅したい？</h2>
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
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-4">
                <h2 className="text-xl font-semibold">宇宙の名前を決める</h2>
                <p className="text-sm text-slate-600">
                  いまのプロジェクトや自分の軸になる名前をつけましょう。
                </p>
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="例: Holoplax Launch"
                  className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4">
                <h2 className="text-xl font-semibold">最初の目標を灯す</h2>
                <p className="text-sm text-slate-600">
                  いちばん大切な1件だけ置いてください。
                </p>
                <input
                  value={goalTitle}
                  onChange={(event) => setGoalTitle(event.target.value)}
                  placeholder="例: 新しいサービスのLPを整える"
                  className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
                <textarea
                  value={goalDescription}
                  onChange={(event) => setGoalDescription(event.target.value)}
                  placeholder="補足があれば一言"
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
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4">
                <h2 className="text-xl font-semibold">旅のリズムを決める</h2>
                <p className="text-sm text-slate-600">
                  スプリントのテンポを選んでください。
                </p>
                <div className="grid gap-2">
                  {cadences.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setCadence(option.id)}
                      className={`border px-4 py-3 text-left text-sm transition ${
                        cadence === option.id
                          ? "border-[#2323eb] bg-[#2323eb]/10 text-[#2323eb]"
                          : "border-slate-200 bg-white hover:border-[#2323eb]/40"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
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
