"use client";

import { useState } from "react";
import {
  SEVERITY,
  SEVERITY_LABELS,
  type Severity,
  TASK_TYPE,
  type TaskDTO,
  type TaskType,
} from "../../../lib/types";
import { LoadingButton } from "../../components/loading-button";

const storyPoints = [1, 2, 3, 5, 8, 13, 21, 34];
const severityOptions: Severity[] = [SEVERITY.LOW, SEVERITY.MEDIUM, SEVERITY.HIGH];
const taskTypeOptions = [
  { value: TASK_TYPE.EPIC, label: "目標 (EPIC)" },
  { value: TASK_TYPE.PBI, label: "PBI" },
  { value: TASK_TYPE.TASK, label: "タスク" },
  { value: TASK_TYPE.ROUTINE, label: "ルーティン" },
];

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

type TaskFormData = {
  title: string;
  description: string;
  definitionOfDone: string;
  checklistText: string;
  points: number;
  urgency: Severity;
  risk: Severity;
  type: TaskType;
  parentId: string;
  dueDate: string;
  assigneeId: string;
  tags: string;
  routineCadence: string;
  dependencyIds: string[];
};

export type TaskCreateWizardProps = {
  open: boolean;
  view: "product" | "sprint";
  members: MemberRow[];
  items: TaskDTO[];
  parentCandidates: TaskDTO[];
  onClose: () => void;
  onSubmit: (form: TaskFormData, aiSupplement: string) => Promise<void>;
};

export function TaskCreateWizard({
  open,
  view,
  members,
  items,
  parentCandidates,
  onClose,
  onSubmit,
}: TaskCreateWizardProps) {
  const createDefaultForm = (): TaskFormData => ({
    title: "",
    description: "",
    definitionOfDone: "",
    checklistText: "",
    points: 3,
    urgency: SEVERITY.MEDIUM,
    risk: SEVERITY.MEDIUM,
    type: view === "sprint" ? TASK_TYPE.TASK : TASK_TYPE.PBI,
    parentId: "",
    dueDate: "",
    assigneeId: members.length === 1 ? members[0].id : "",
    tags: "",
    routineCadence: "NONE",
    dependencyIds: [],
  });

  const [form, setForm] = useState<TaskFormData>(createDefaultForm);
  const [creationStep, setCreationStep] = useState<1 | 2 | 3>(1);
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [aiAnswers, setAiAnswers] = useState<Record<number, string>>({});
  const [estimatedScore, setEstimatedScore] = useState<{
    points: number;
    urgency: string;
    risk: string;
    reason?: string;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [definitionError, setDefinitionError] = useState<string | null>(null);
  const [scoreHint, setScoreHint] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  const resetState = () => {
    setForm(createDefaultForm());
    setCreationStep(1);
    setAiQuestions([]);
    setAiAnswers({});
    setEstimatedScore(null);
    setAiError(null);
    setScoreHint(null);
    setSuggestion(null);
    setAiLoading(false);
    setDefinitionError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleAiAnswerChange = (index: number, value: string) => {
    setAiAnswers((prev) => ({ ...prev, [index]: value }));
  };

  const runAiSupport = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const scoreRes = await fetch("/api/ai/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
        }),
      });
      if (!scoreRes.ok) {
        throw new Error("score");
      }
      const scoreData = await scoreRes.json();
      setEstimatedScore(scoreData);
      setForm((prev) => ({
        ...prev,
        points: Number(scoreData.points) || prev.points,
        urgency: scoreData.urgency ?? prev.urgency,
        risk: scoreData.risk ?? prev.risk,
      }));
      setScoreHint(scoreData.reason ?? `AI推定スコア: ${scoreData.score ?? ""}`);
      const suggestionRes = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
        }),
      });
      let suggestionText = "";
      if (suggestionRes.ok) {
        const suggestionData = await suggestionRes.json().catch(() => ({}));
        suggestionText = suggestionData?.suggestion ?? "";
      }
      setAiQuestions([
        suggestionText || "このタスクの詳細／背景を教えてください。",
        scoreData.reason ? `AI推定理由: ${scoreData.reason}` : "補足情報があれば教えてください。",
      ]);
    } catch {
      setAiError("AI支援に失敗しました。手動で入力できます。");
      setAiQuestions(["このタスクの目的は何ですか？", "優先順位が高い理由は何ですか？"]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleStepOneNext = () => {
    if (!form.title.trim()) {
      setAiError("タイトルを入力してください。");
      return;
    }
    setAiError(null);
    setCreationStep(2);
    void runAiSupport();
  };

  const handleStepTwoNext = () => {
    if (!form.definitionOfDone.trim()) {
      setDefinitionError("完了条件を入力してください。");
      return;
    }
    setDefinitionError(null);
    setCreationStep(3);
  };

  const buildAiSupplementText = () => {
    const extras = aiQuestions
      .map((question, index) => {
        const answer = aiAnswers[index]?.trim();
        if (!answer) return null;
        return `${question}\n回答: ${answer}`;
      })
      .filter(Boolean);
    if (!extras.length) return "";
    return `AI補足\n${extras.join("\n\n")}`;
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setAddLoading(true);
    try {
      const aiSupplement = buildAiSupplementText();
      await onSubmit(form, aiSupplement);
      handleClose();
    } catch {
      // Error handling is done in parent
    } finally {
      setAddLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">タスクを追加</h3>
          <button
            onClick={handleClose}
            className="text-sm text-slate-500 transition hover:text-slate-800"
          >
            閉じる
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Step {creationStep}/3 -{" "}
          {creationStep === 1
            ? "まずは要件と背景を教えてください。"
            : creationStep === 2
              ? "どうやったら終わるかを教えてください。"
              : "情報を確認してタスクを仕上げます。"}
        </p>

        {creationStep === 1 ? (
          <div className="mt-4 grid gap-3">
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="タイトル"
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="概要（任意）"
              rows={4}
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            />
            {aiError ? <p className="text-xs text-rose-600">{aiError}</p> : null}
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={handleClose}
                className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
              >
                キャンセル
              </button>
              <LoadingButton
                onClick={handleStepOneNext}
                loading={aiLoading}
                className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30 disabled:opacity-60"
              >
                次へ
              </LoadingButton>
            </div>
          </div>
        ) : creationStep === 2 ? (
          <div className="mt-4 grid gap-3">
            {estimatedScore ? (
              <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">
                  AIがポイント・緊急度・リスクを先行推定済みです。
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {`推定: ${estimatedScore.points} pt / 緊急度: ${SEVERITY_LABELS[estimatedScore.urgency as Severity] ?? estimatedScore.urgency} / リスク: ${SEVERITY_LABELS[estimatedScore.risk as Severity] ?? estimatedScore.risk}`}
                </p>
              </div>
            ) : null}
            <p className="text-sm text-slate-700">
              このタスクを終えるために必要なことを教えてください。
            </p>
            <textarea
              value={form.definitionOfDone}
              onChange={(e) => setForm((p) => ({ ...p, definitionOfDone: e.target.value }))}
              placeholder="どうやったら終わる？"
              rows={4}
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            />
            {definitionError ? <p className="text-xs text-rose-600">{definitionError}</p> : null}
            <div className="mt-4 border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                AIの追加質問
              </p>
              <div className="mt-3 grid gap-3">
                {aiQuestions.length ? (
                  aiQuestions.map((question, index) => (
                    <div key={`${question}-${index}`} className="grid gap-2">
                      <p className="text-xs text-slate-600">{question}</p>
                      <textarea
                        value={aiAnswers[index] ?? ""}
                        onChange={(e) => handleAiAnswerChange(index, e.target.value)}
                        rows={2}
                        className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                        placeholder="回答を入力（任意）"
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">
                    AIの質問を生成中です。少々お待ちください。
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => {
                  setCreationStep(1);
                  setDefinitionError(null);
                }}
                className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={handleStepTwoNext}
                className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30 disabled:opacity-60"
              >
                次へ
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {estimatedScore ? (
              <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">AI予測を踏まえて詳細を整えています。</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {`推定: ${estimatedScore.points} pt / 緊急度: ${SEVERITY_LABELS[estimatedScore.urgency as Severity] ?? estimatedScore.urgency} / リスク: ${SEVERITY_LABELS[estimatedScore.risk as Severity] ?? estimatedScore.risk}`}
                </p>
              </div>
            ) : null}
            <div className="border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">完了条件</p>
              <p className="mt-1 whitespace-pre-wrap">
                {form.definitionOfDone || "未入力のまま進めることもできます。"}
              </p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-1 text-xs text-slate-500">
                <span>ポイント</span>
                <div className="flex flex-wrap gap-2">
                  {storyPoints.map((pt) => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, points: pt }))}
                      aria-pressed={form.points === pt}
                      className={`border px-3 py-1 text-sm transition ${
                        form.points === pt
                          ? "border-[#2323eb] bg-[#2323eb]/10 text-[#2323eb]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {pt} pt
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 text-xs text-slate-500">
                <div className="flex items-end gap-4">
                  <div className="flex-1 min-w-0">
                    <span>緊急度</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {severityOptions.map((option) => (
                        <button
                          key={`urgency-${option}`}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, urgency: option }))}
                          aria-pressed={form.urgency === option}
                          className={`border px-3 py-1 text-sm transition ${
                            form.urgency === option
                              ? "border-[#2323eb] bg-[#2323eb]/10 text-[#2323eb]"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          {SEVERITY_LABELS[option]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span>リスク</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {severityOptions.map((option) => (
                        <button
                          key={`risk-${option}`}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, risk: option }))}
                          aria-pressed={form.risk === option}
                          className={`border px-3 py-1 text-sm transition ${
                            form.risk === option
                              ? "border-[#2323eb] bg-[#2323eb]/10 text-[#2323eb]"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          {SEVERITY_LABELS[option]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-slate-500">
                種別
                <select
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as TaskType }))}
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                >
                  {taskTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                親アイテム
                <select
                  value={form.parentId}
                  onChange={(e) => setForm((p) => ({ ...p, parentId: e.target.value }))}
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                >
                  <option value="">未設定</option>
                  {parentCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {form.type === TASK_TYPE.ROUTINE ? (
              <label className="grid gap-1 text-xs text-slate-500">
                ルーティン周期
                <select
                  value={form.routineCadence}
                  onChange={(e) => setForm((p) => ({ ...p, routineCadence: e.target.value }))}
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                >
                  <option value="DAILY">毎日</option>
                  <option value="WEEKLY">毎週</option>
                  <option value="NONE">なし</option>
                </select>
              </label>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-xs text-slate-500">
                期限
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                担当
                <select
                  value={form.assigneeId}
                  onChange={(e) => setForm((p) => ({ ...p, assigneeId: e.target.value }))}
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                >
                  <option value="">未設定</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name ?? member.email ?? "メンバー"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                タグ
                <input
                  value={form.tags}
                  onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="ui, sprint"
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs text-slate-500">
              依存タスク
              <select
                multiple
                value={form.dependencyIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map(
                    (option) => option.value,
                  );
                  setForm((p) => ({ ...p, dependencyIds: selected }));
                }}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              >
                {items.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, dependencyIds: [] }))}
                className="w-fit text-[11px] text-slate-500 transition hover:text-[#2323eb]"
              >
                選択を解除
              </button>
            </label>
            {scoreHint ? (
              <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {scoreHint}
              </div>
            ) : null}
            {suggestion ? (
              <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
                {suggestion}
              </div>
            ) : null}
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => {
                  setCreationStep(2);
                  setDefinitionError(null);
                }}
                className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
              >
                戻る
              </button>
              <LoadingButton
                onClick={handleSubmit}
                loading={addLoading}
                className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30 disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  {addLoading ? (
                    <span className="inline-flex items-center">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                    </span>
                  ) : null}
                  追加する
                </span>
              </LoadingButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
