"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SEVERITY, SEVERITY_LABELS, type Severity, TASK_STATUS } from "../../lib/types";
import { TaskCard } from "../components/task-card";
import { useWorkspaceId } from "../components/use-workspace-id";
import { useSprintManagement } from "./hooks/use-sprint-management";
import { useSprintOptimizer } from "./hooks/use-sprint-optimizer";
import { useSprintTasks } from "./hooks/use-sprint-tasks";

const storyPoints = [1, 2, 3, 5, 8, 13, 21, 34];

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

export default function SprintPage() {
  const { workspaceId, ready } = useWorkspaceId();
  const [members, setMembers] = useState<MemberRow[]>([]);

  const {
    sprint,
    sprintHistory,
    sprintLoading,
    sprintForm,
    setSprintForm,
    fetchSprint,
    fetchSprintHistory,
    startSprint,
    endSprint,
    updateSprint,
  } = useSprintManagement({
    ready,
    workspaceId,
    onSprintChange: () => void fetchTasks(),
  });

  const {
    displayedItems,
    used,
    newItem,
    setNewItem,
    editItem,
    editForm,
    setEditForm,
    fetchTasks,
    addItem,
    markDone,
    deleteItem,
    openEdit,
    closeEdit,
    saveEdit,
    toggleChecklistItem,
    isBlocked,
  } = useSprintTasks({ ready, workspaceId, sprintId: sprint?.id });

  const {
    optimizationResult,
    loading: optimizerLoading,
    adding: optimizerAdding,
    showPanel: showOptimizerPanel,
    summary: optimizerSummary,
    runOptimization,
    addSelectedTasks,
    closePanel: closeOptimizerPanel,
    calculateTaskScore,
  } = useSprintOptimizer({
    ready,
    workspaceId,
    capacity: sprintForm.capacityPoints - used,
    onTasksAdded: () => void fetchTasks(),
  });

  const fetchMembers = useCallback(async () => {
    if (!ready || !workspaceId) {
      setMembers([]);
      return;
    }
    const res = await fetch(`/api/workspaces/${workspaceId}/members`);
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members ?? []);
  }, [ready, workspaceId]);

  useEffect(() => {
    void Promise.all([fetchTasks(), fetchSprint(), fetchSprintHistory(), fetchMembers()]);
  }, [fetchTasks, fetchSprint, fetchSprintHistory, fetchMembers]);

  const activeCapacity = sprint?.capacityPoints ?? 24;
  const remaining = activeCapacity - used;

  const handleAddItem = () => addItem(remaining);

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Sprint</p>
            <h1 className="text-3xl font-semibold text-slate-900">スプリント</h1>
            <p className="text-sm text-slate-600">
              キャパはポイントベース（例: 24pt）。バックログから選んでコミットするモック。
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
              キャパ {activeCapacity} pt
            </span>
            <span className="border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
              残り {remaining} pt
            </span>
            <Link
              href="/review"
              className="border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              レビューへ
            </Link>
            <button
              onClick={runOptimization}
              disabled={optimizerLoading}
              className="border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-60"
            >
              {optimizerLoading ? "計算中..." : "最適化"}
            </button>
            {sprint ? (
              <button
                onClick={endSprint}
                disabled={sprintLoading}
                className="bg-slate-900 px-4 py-2 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/30 disabled:opacity-60"
              >
                スプリント終了
              </button>
            ) : (
              <button
                onClick={startSprint}
                disabled={sprintLoading}
                className="bg-[#2323eb] px-4 py-2 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30 disabled:opacity-60"
              >
                スプリント開始
              </button>
            )}
          </div>
        </div>
        {sprint ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="border border-slate-200 bg-slate-50 px-2 py-1">{sprint.name}</span>
            <span className="border border-slate-200 bg-slate-50 px-2 py-1">
              開始: {sprint.startedAt ? new Date(sprint.startedAt).toLocaleDateString() : "-"}
            </span>
          </div>
        ) : (
          <div className="mt-3 text-xs text-slate-500">スプリントは未開始です。</div>
        )}
      </header>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">スプリント設定</h3>
          {sprint ? (
            <button
              onClick={updateSprint}
              disabled={sprintLoading}
              className="border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-60"
            >
              変更を保存
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="grid gap-1 text-xs text-slate-500">
            名前
            <input
              value={sprintForm.name}
              onChange={(e) => setSprintForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              placeholder="Sprint-Launch"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            キャパ
            <input
              type="number"
              min={1}
              value={sprintForm.capacityPoints}
              onChange={(e) =>
                setSprintForm((p) => ({
                  ...p,
                  capacityPoints: Number(e.target.value) || 0,
                }))
              }
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            開始日
            <input
              type="date"
              value={sprintForm.startedAt}
              onChange={(e) => setSprintForm((p) => ({ ...p, startedAt: e.target.value }))}
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            予定終了日
            <input
              type="date"
              value={sprintForm.plannedEndAt}
              onChange={(e) => setSprintForm((p) => ({ ...p, plannedEndAt: e.target.value }))}
              className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            />
          </label>
        </div>
        {!sprint ? (
          <div className="mt-3 text-xs text-slate-500">
            開始ボタンを押すとこの設定でスプリントが作成されます。
          </div>
        ) : null}
      </section>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3">
          <input
            value={newItem.title}
            onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
            placeholder="タスク名"
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          />
          <textarea
            value={newItem.description}
            onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
            placeholder="概要（任意）"
            rows={2}
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          />
          <input
            value={newItem.definitionOfDone}
            onChange={(e) => setNewItem((p) => ({ ...p, definitionOfDone: e.target.value }))}
            placeholder="完了条件（DoD）"
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          />
          <textarea
            value={newItem.checklistText}
            onChange={(e) => setNewItem((p) => ({ ...p, checklistText: e.target.value }))}
            placeholder="チェックリスト（1行1項目）"
            rows={3}
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="grid gap-1 text-xs text-slate-500">
              ポイント
              <select
                value={newItem.points}
                onChange={(e) => setNewItem((p) => ({ ...p, points: Number(e.target.value) || 1 }))}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              >
                {storyPoints.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt} pt
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={handleAddItem}
              disabled={newItem.points > remaining}
              className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb] disabled:opacity-50"
            >
              追加
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-slate-500">
              期限
              <input
                type="date"
                value={newItem.dueDate}
                onChange={(e) => setNewItem((p) => ({ ...p, dueDate: e.target.value }))}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-500">
              担当
              <select
                value={newItem.assigneeId}
                onChange={(e) => setNewItem((p) => ({ ...p, assigneeId: e.target.value }))}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              >
                <option value="">未設定</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name ?? member.email ?? member.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-slate-500">
              タグ
              <input
                value={newItem.tags}
                onChange={(e) => setNewItem((p) => ({ ...p, tags: e.target.value }))}
                placeholder="ui, sprint"
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3">
          {displayedItems
            .filter((item) => item.status !== TASK_STATUS.DONE)
            .map((item) => (
              <TaskCard
                key={item.id}
                item={item}
                variant="sprint"
                members={members.map((m) => ({ id: m.id, name: m.name }))}
                isBlocked={isBlocked(item)}
                showSeverity={false}
                onMarkDone={() => markDone(item.id)}
                onEdit={() => openEdit(item)}
                onDelete={() => deleteItem(item.id)}
                onToggleChecklistItem={(checklistId) => toggleChecklistItem(item.id, checklistId)}
              />
            ))}
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">完了</h3>
          <span className="text-xs text-slate-500">
            {displayedItems.filter((item) => item.status === TASK_STATUS.DONE).length} 件
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          {displayedItems
            .filter((item) => item.status === TASK_STATUS.DONE)
            .map((item) => (
              <TaskCard
                key={item.id}
                item={item}
                variant="compact"
                showSeverity={false}
                showChecklist={false}
                showMetadata={false}
                onEdit={() => openEdit(item)}
                onDelete={() => deleteItem(item.id)}
              />
            ))}
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">スプリント履歴</h3>
          <button
            onClick={fetchSprintHistory}
            className="border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
          >
            更新
          </button>
        </div>
        <div className="mt-4 grid gap-2 text-sm">
          {sprintHistory.length ? (
            sprintHistory.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1.2fr_0.6fr_0.6fr_0.6fr_0.8fr] items-center gap-3 border border-slate-200 px-3 py-2 text-xs text-slate-600"
              >
                <span className="text-slate-800">{item.name}</span>
                <span>{item.status}</span>
                <span>{item.capacityPoints} pt</span>
                <span>{item.completedPoints ?? 0} pt</span>
                <span className="text-[11px] text-slate-500">
                  {item.startedAt ? new Date(item.startedAt).toLocaleDateString() : "-"}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-500">履歴がまだありません。</div>
          )}
        </div>
      </section>

      {showOptimizerPanel && optimizationResult ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">最適化結果</h3>
                {optimizerSummary ? (
                  <p className="text-sm text-slate-600">{optimizerSummary}</p>
                ) : null}
              </div>
              <button
                onClick={closeOptimizerPanel}
                className="text-sm text-slate-500 transition hover:text-slate-800"
              >
                閉じる
              </button>
            </div>

            {optimizationResult.selectedTasks.length > 0 ? (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700">
                    選択されたタスク ({optimizationResult.selectedTasks.length}件)
                  </h4>
                  <button
                    onClick={addSelectedTasks}
                    disabled={optimizerAdding}
                    className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30 disabled:opacity-60"
                  >
                    {optimizerAdding ? "追加中..." : "一括追加"}
                  </button>
                </div>
                <div className="mt-2 grid gap-2">
                  {optimizationResult.selectedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex-1">
                        <span className="text-sm text-slate-800">{task.title}</span>
                        <div className="flex gap-2 text-xs text-slate-500">
                          <span>{task.points}pt</span>
                          <span>緊急度: {SEVERITY_LABELS[task.urgency]}</span>
                          <span>リスク: {SEVERITY_LABELS[task.risk]}</span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500">
                        スコア: {calculateTaskScore(task).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-500">
                キャパ内に収まるタスクがありません。
              </div>
            )}

            {optimizationResult.excludedTasks.length > 0 ? (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-slate-700">
                  除外されたタスク ({optimizationResult.excludedTasks.length}件)
                </h4>
                <div className="mt-2 grid gap-2">
                  {optimizationResult.excludedTasks.map(({ task, reason }) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between border border-slate-200 px-3 py-2 text-slate-500"
                    >
                      <div className="flex-1">
                        <span className="text-sm">{task.title}</span>
                        <span className="ml-2 text-xs">({task.points}pt)</span>
                      </div>
                      <span className="text-xs">{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {editItem ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4">
          <div className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">タスクを編集</h3>
              <button
                onClick={closeEdit}
                className="text-sm text-slate-500 transition hover:text-slate-800"
              >
                閉じる
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="タスク名"
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              />
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="概要（任意）"
                rows={3}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              />
              <input
                value={editForm.definitionOfDone}
                onChange={(e) => setEditForm((p) => ({ ...p, definitionOfDone: e.target.value }))}
                placeholder="完了条件（DoD）"
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              />
              <textarea
                value={editForm.checklistText}
                onChange={(e) => setEditForm((p) => ({ ...p, checklistText: e.target.value }))}
                placeholder="チェックリスト（1行1項目）"
                rows={3}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-slate-500">
                  ポイント
                  <select
                    value={editForm.points}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, points: Number(e.target.value) || 1 }))
                    }
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    {storyPoints.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt} pt
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                  緊急度
                  <select
                    value={editForm.urgency}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, urgency: e.target.value as Severity }))
                    }
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    {[SEVERITY.LOW, SEVERITY.MEDIUM, SEVERITY.HIGH].map((v) => (
                      <option key={v} value={v}>
                        {SEVERITY_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                  リスク
                  <select
                    value={editForm.risk}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, risk: e.target.value as Severity }))
                    }
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    {[SEVERITY.LOW, SEVERITY.MEDIUM, SEVERITY.HIGH].map((v) => (
                      <option key={v} value={v}>
                        {SEVERITY_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-slate-500">
                  期限
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm((p) => ({ ...p, dueDate: e.target.value }))}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                  担当
                  <select
                    value={editForm.assigneeId}
                    onChange={(e) => setEditForm((p) => ({ ...p, assigneeId: e.target.value }))}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    <option value="">未設定</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name ?? member.email ?? member.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                  タグ
                  <input
                    value={editForm.tags}
                    onChange={(e) => setEditForm((p) => ({ ...p, tags: e.target.value }))}
                    placeholder="ui, sprint"
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                </label>
              </div>
              <button
                onClick={saveEdit}
                className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30"
              >
                変更を保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
