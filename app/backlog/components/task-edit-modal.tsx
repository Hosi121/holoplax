"use client";

import { useEffect, useState } from "react";
import {
  SEVERITY,
  SEVERITY_LABELS,
  type Severity,
  TASK_TYPE,
  type TaskDTO,
  type TaskType,
} from "../../../lib/types";

const storyPoints = [1, 2, 3, 5, 8, 13, 21, 34];
const severityOptions: Severity[] = [SEVERITY.LOW, SEVERITY.MEDIUM, SEVERITY.HIGH];
const taskTypeOptions = [
  { value: TASK_TYPE.EPIC, label: "目標 (EPIC)" },
  { value: TASK_TYPE.PBI, label: "PBI" },
  { value: TASK_TYPE.TASK, label: "タスク" },
  { value: TASK_TYPE.ROUTINE, label: "ルーティン" },
];

const checklistToText = (checklist?: { id: string; text: string; done: boolean }[] | null) =>
  (checklist ?? []).map((item) => item.text).join("\n");

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

export type TaskEditFormData = {
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

export type TaskEditModalProps = {
  task: TaskDTO | null;
  members: MemberRow[];
  items: TaskDTO[];
  parentCandidates: TaskDTO[];
  onClose: () => void;
  onSave: (taskId: string, form: TaskEditFormData) => Promise<void>;
};

export function TaskEditModal({
  task,
  members,
  items,
  parentCandidates,
  onClose,
  onSave,
}: TaskEditModalProps) {
  const [form, setForm] = useState<TaskEditFormData>({
    title: "",
    description: "",
    definitionOfDone: "",
    checklistText: "",
    points: 3,
    urgency: SEVERITY.MEDIUM,
    risk: SEVERITY.MEDIUM,
    type: TASK_TYPE.PBI,
    parentId: "",
    dueDate: "",
    assigneeId: "",
    tags: "",
    routineCadence: "NONE",
    dependencyIds: [],
  });

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title,
        description: task.description ?? "",
        definitionOfDone: task.definitionOfDone ?? "",
        checklistText: checklistToText(task.checklist ?? null),
        points: task.points,
        urgency: (task.urgency as Severity) ?? SEVERITY.MEDIUM,
        risk: (task.risk as Severity) ?? SEVERITY.MEDIUM,
        type: task.type ?? TASK_TYPE.PBI,
        parentId: task.parentId ?? "",
        dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : "",
        assigneeId: task.assigneeId ?? "",
        tags: task.tags?.join(", ") ?? "",
        routineCadence: task.routineCadence ?? "NONE",
        dependencyIds: task.dependencyIds ?? [],
      });
    }
  }, [task]);

  const handleSave = async () => {
    if (!task) return;
    await onSave(task.id, form);
    onClose();
  };

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">タスクを編集</h3>
          <button
            onClick={onClose}
            className="text-sm text-slate-500 transition hover:text-slate-800"
          >
            閉じる
          </button>
        </div>
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
            rows={3}
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          />
          <input
            value={form.definitionOfDone}
            onChange={(e) => setForm((p) => ({ ...p, definitionOfDone: e.target.value }))}
            placeholder="完了条件（DoD）"
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          />
          <textarea
            value={form.checklistText}
            onChange={(e) => setForm((p) => ({ ...p, checklistText: e.target.value }))}
            placeholder="チェックリスト（1行1項目）"
            rows={3}
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={form.points}
              onChange={(e) => setForm((p) => ({ ...p, points: Number(e.target.value) || 1 }))}
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            >
              {storyPoints.map((pt) => (
                <option key={pt} value={pt}>
                  {pt} pt
                </option>
              ))}
            </select>
            <select
              value={form.urgency}
              onChange={(e) => setForm((p) => ({ ...p, urgency: e.target.value as Severity }))}
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            >
              {severityOptions.map((v) => (
                <option key={v} value={v}>
                  {SEVERITY_LABELS[v]}
                </option>
              ))}
            </select>
            <select
              value={form.risk}
              onChange={(e) => setForm((p) => ({ ...p, risk: e.target.value as Severity }))}
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            >
              {severityOptions.map((v) => (
                <option key={v} value={v}>
                  {SEVERITY_LABELS[v]}
                </option>
              ))}
            </select>
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
                {parentCandidates
                  .filter((candidate) => candidate.id !== task.id)
                  .map((candidate) => (
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
                const selected = Array.from(e.target.selectedOptions).map((option) => option.value);
                setForm((p) => ({ ...p, dependencyIds: selected }));
              }}
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            >
              {items
                .filter((candidate) => candidate.id !== task.id)
                .map((candidate) => (
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
          <button
            onClick={handleSave}
            className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30"
          >
            変更を保存
          </button>
        </div>
      </div>
    </div>
  );
}
