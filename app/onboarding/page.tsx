"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "../../lib/cn";
import { STORY_POINTS } from "../../lib/points";
import { InlineError } from "../components/ui/feedback";

const intents = [
  { id: "personal", title: "個人で使う", summary: "自分の目標や日々のやることを整理する" },
  { id: "team", title: "チームで使う", summary: "メンバーと計画や進み具合を共有する" },
  { id: "learning", title: "習慣や学習に使う", summary: "繰り返し取り組み、成長を記録する" },
  { id: "product", title: "仕事・事業で使う", summary: "成果に向けて優先順位を決める" },
] as const;

const focusTaskSlots = ["focus-1", "focus-2", "focus-3"] as const;

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = useMemo(
    () => step !== 0 || workspaceName.trim().length > 1,
    [step, workspaceName],
  );

  const continueOrFinish = async () => {
    if (!canContinue) return;
    if (step < 2) {
      setStep((current) => current + 1);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/onboarding", {
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
          routineCadence: routineTitle.trim() ? routineCadence : undefined,
          focusTasks: focusTasks.map((task) => task.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "初期設定を完了できませんでした。");
        return;
      }
      await update({ user: { onboardingCompletedAt: new Date().toISOString() } });
      router.push("/delegate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <header className="grid gap-2 text-center">
          <p className="text-xs text-slate-500">初期設定</p>
          <h1 className="text-3xl font-semibold">Holoplaxを使い始める</h1>
          <p className="text-sm text-slate-600">必須なのはワークスペース名だけです。</p>
        </header>

        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4 text-xs text-slate-500">
            <span>ステップ {step + 1} / 3</span>
            <div className="flex flex-1 justify-end gap-2" aria-hidden>
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className={cn("h-1 w-12", step >= index ? "bg-[#2323eb]" : "bg-slate-200")}
                />
              ))}
            </div>
          </div>

          {step === 0 ? (
            <div className="grid gap-5">
              <div>
                <h2 className="text-xl font-semibold">利用目的とワークスペース</h2>
                <p className="mt-1 text-sm text-slate-600">
                  利用目的は、最初に表示する案内を調整するために使います。
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {intents.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={intent === option.id}
                    onClick={() => setIntent(option.id)}
                    className={cn(
                      "border px-4 py-4 text-left",
                      intent === option.id
                        ? "border-[#2323eb] bg-[#2323eb]/10 text-[#2323eb]"
                        : "border-slate-200 bg-white hover:border-[#2323eb]/40",
                    )}
                  >
                    <span className="block text-sm font-semibold">{option.title}</span>
                    <span className="mt-2 block text-xs text-slate-600">{option.summary}</span>
                  </button>
                ))}
              </div>
              <label className="grid gap-1 text-xs text-slate-600">
                ワークスペース名 <span className="text-rose-600">必須</span>
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="例: 新サービス開発"
                  autoFocus
                  className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-5">
              <div>
                <h2 className="text-xl font-semibold">目標と繰り返し</h2>
                <p className="mt-1 text-sm text-slate-600">
                  任意です。必要なければ空のまま次へ進めます。
                </p>
              </div>
              <label className="grid gap-1 text-xs text-slate-600">
                最初の目標
                <input
                  value={goalTitle}
                  onChange={(event) => setGoalTitle(event.target.value)}
                  placeholder="例: 新しいサービスの案内ページを公開する"
                  className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
              </label>
              {goalTitle ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <textarea
                    value={goalDescription}
                    onChange={(event) => setGoalDescription(event.target.value)}
                    placeholder="目標の補足（任意）"
                    rows={3}
                    className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                  <label className="grid content-start gap-1 text-xs text-slate-600">
                    大きさ
                    <select
                      value={points}
                      onChange={(event) => setPoints(Number(event.target.value) || 1)}
                      className="border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800"
                    >
                      {STORY_POINTS.map((point) => (
                        <option key={point} value={point}>
                          {point} pt
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              <label className="grid gap-1 text-xs text-slate-600">
                繰り返すこと
                <input
                  value={routineTitle}
                  onChange={(event) => setRoutineTitle(event.target.value)}
                  placeholder="例: 朝に今日の予定を確認する"
                  className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
              </label>
              {routineTitle ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <textarea
                    value={routineDescription}
                    onChange={(event) => setRoutineDescription(event.target.value)}
                    placeholder="補足（任意）"
                    rows={2}
                    className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                  <label className="grid content-start gap-1 text-xs text-slate-600">
                    頻度
                    <select
                      value={routineCadence}
                      onChange={(event) => setRoutineCadence(event.target.value)}
                      className="border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800"
                    >
                      <option value="DAILY">毎日</option>
                      <option value="WEEKLY">毎週</option>
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-5">
              <div>
                <h2 className="text-xl font-semibold">最初のやること</h2>
                <p className="mt-1 text-sm text-slate-600">
                  任意です。思い浮かぶものだけ入力してください。
                </p>
              </div>
              <div className="grid gap-2">
                {focusTaskSlots.map((slot, index) => (
                  <input
                    key={slot}
                    value={focusTasks[index] ?? ""}
                    onChange={(event) =>
                      setFocusTasks((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                    placeholder={`やること ${index + 1}（任意）`}
                    className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-5">
              <InlineError message={error} />
            </div>
          ) : null}
          {!canContinue ? (
            <p className="mt-4 text-sm text-amber-700">ワークスペース名を入力してください。</p>
          ) : null}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || saving}
              className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={() => void continueOrFinish()}
              disabled={!canContinue || saving}
              className="bg-[#2323eb] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "準備中..." : step < 2 ? "次へ" : "利用を開始"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
