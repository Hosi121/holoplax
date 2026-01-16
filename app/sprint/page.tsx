"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/sidebar";
import { useWorkspaceId } from "../components/use-workspace-id";
import { SprintDTO, TASK_STATUS, TaskDTO } from "../../lib/types";

const storyPoints = [1, 2, 3, 5, 8, 13, 21, 34];
type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

export default function SprintPage() {
  const capacity = 24;
  const { workspaceId, ready } = useWorkspaceId();
  const [items, setItems] = useState<TaskDTO[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [sprint, setSprint] = useState<SprintDTO | null>(null);
  const [sprintHistory, setSprintHistory] = useState<
    (SprintDTO & { committedPoints?: number; completedPoints?: number })[]
  >([]);
  const [sprintLoading, setSprintLoading] = useState(false);
  const [sprintForm, setSprintForm] = useState({
    name: "",
    capacityPoints: 24,
    startedAt: "",
    plannedEndAt: "",
  });
  const [newItem, setNewItem] = useState({
    title: "",
    description: "",
    points: 1,
    dueDate: "",
    assigneeId: "",
    tags: "",
  });
  const [editItem, setEditItem] = useState<TaskDTO | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    points: 1,
    urgency: "中",
    risk: "中",
    dueDate: "",
    assigneeId: "",
    tags: "",
  });

  const fetchTasks = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setItems([]);
      return;
    }
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setItems((data.tasks ?? []).filter((t: TaskDTO) => t.status !== TASK_STATUS.BACKLOG));
  }, [ready, workspaceId]);

  const fetchSprint = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setSprint(null);
      return;
    }
    const res = await fetch("/api/sprints/current");
    if (!res.ok) return;
    const data = await res.json();
    setSprint(data.sprint ?? null);
    if (data.sprint) {
      setSprintForm({
        name: data.sprint.name ?? "",
        capacityPoints: data.sprint.capacityPoints ?? capacity,
        startedAt: data.sprint.startedAt
          ? new Date(data.sprint.startedAt).toISOString().slice(0, 10)
          : "",
        plannedEndAt: data.sprint.plannedEndAt
          ? new Date(data.sprint.plannedEndAt).toISOString().slice(0, 10)
          : "",
      });
    } else {
      setSprintForm((prev) => ({
        ...prev,
        capacityPoints: capacity,
      }));
    }
  }, [ready, workspaceId]);

  const fetchSprintHistory = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setSprintHistory([]);
      return;
    }
    const res = await fetch("/api/sprints");
    if (!res.ok) return;
    const data = await res.json();
    setSprintHistory(data.sprints ?? []);
  }, [ready, workspaceId]);

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
    void fetchTasks();
    void fetchSprint();
    void fetchSprintHistory();
    void fetchMembers();
  }, [fetchTasks, fetchSprint, fetchSprintHistory, fetchMembers]);

  const used = useMemo(
    () => items.filter((i) => i.status !== TASK_STATUS.DONE).reduce((sum, i) => sum + i.points, 0),
    [items],
  );
  const isBlocked = (item: TaskDTO) =>
    (item.dependencies ?? []).some((dep) => dep.status !== TASK_STATUS.DONE);
  const activeCapacity = sprint?.capacityPoints ?? capacity;
  const remaining = activeCapacity - used;

  const addItem = async () => {
    if (!newItem.title.trim() || newItem.points <= 0) return;
    if (newItem.points > remaining) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newItem.title.trim(),
        description: newItem.description.trim(),
        points: Number(newItem.points),
        urgency: "中",
        risk: "中",
        status: TASK_STATUS.SPRINT,
        dueDate: newItem.dueDate || null,
        assigneeId: newItem.assigneeId || null,
        tags: newItem.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    });
    setNewItem({
      title: "",
      description: "",
      points: 1,
      dueDate: "",
      assigneeId: "",
      tags: "",
    });
    fetchTasks();
  };

  const startSprint = async () => {
    setSprintLoading(true);
    try {
      const res = await fetch("/api/sprints/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sprintForm.name.trim() || undefined,
          capacityPoints: sprintForm.capacityPoints,
          plannedEndAt: sprintForm.plannedEndAt || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSprint(data.sprint ?? null);
        fetchSprintHistory();
      }
    } finally {
      setSprintLoading(false);
    }
  };

  const endSprint = async () => {
    setSprintLoading(true);
    try {
      const res = await fetch("/api/sprints/current", { method: "PATCH" });
      if (res.ok) {
        const data = await res.json();
        setSprint(data.sprint ?? null);
      }
      fetchTasks();
      fetchSprintHistory();
    } finally {
      setSprintLoading(false);
    }
  };

  const updateSprint = async () => {
    if (!sprint) return;
    setSprintLoading(true);
    try {
      const res = await fetch(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sprintForm.name,
          capacityPoints: sprintForm.capacityPoints,
          startedAt: sprintForm.startedAt || null,
          plannedEndAt: sprintForm.plannedEndAt || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSprint(data.sprint ?? null);
        fetchSprintHistory();
      }
    } finally {
      setSprintLoading(false);
    }
  };

  const markDone = async (id: string) => {
    const target = items.find((item) => item.id === id);
    if (target && isBlocked(target)) {
      window.alert("依存タスクが未完了のため完了にできません。");
      return;
    }
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: TASK_STATUS.DONE }),
    });
    fetchTasks();
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm("このタスクを削除しますか？")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    fetchTasks();
  };

  const openEdit = (item: TaskDTO) => {
    setEditItem(item);
    setEditForm({
      title: item.title,
      description: item.description ?? "",
      points: item.points,
      urgency: item.urgency,
      risk: item.risk,
      dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : "",
      assigneeId: item.assigneeId ?? "",
      tags: item.tags?.join(", ") ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editItem) return;
    await fetch(`/api/tasks/${editItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        points: Number(editForm.points),
        urgency: editForm.urgency,
        risk: editForm.risk,
        dueDate: editForm.dueDate || null,
        assigneeId: editForm.assigneeId || null,
        tags: editForm.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    });
    setEditItem(null);
    fetchTasks();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-10 lg:px-6 lg:py-14">
      <Sidebar />
      <main className="flex-1 space-y-6">
        <header className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                Sprint
              </p>
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
              <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                {sprint.name}
              </span>
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
                onChange={(e) =>
                  setSprintForm((p) => ({ ...p, plannedEndAt: e.target.value }))
                }
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
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="grid gap-1 text-xs text-slate-500">
                ポイント
                <select
                  value={newItem.points}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, points: Number(e.target.value) || 1 }))
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
                <button
                  onClick={addItem}
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
            {items
              .filter((item) => item.status !== TASK_STATUS.DONE)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    {item.description ? (
                      <p className="text-xs text-slate-600">{item.description}</p>
                    ) : null}
                    {item.dependencies && item.dependencies.length > 0 ? (
                      <p
                        className={`mt-1 text-xs ${
                          isBlocked(item) ? "text-amber-700" : "text-slate-500"
                        }`}
                      >
                        依存:{" "}
                        {item.dependencies
                          .map((dep) =>
                            dep.status === TASK_STATUS.DONE
                              ? dep.title
                              : `${dep.title}*`,
                          )
                          .join(", ")}
                      </p>
                    ) : null}
                  </div>
                <div className="flex items-center gap-2">
                  <span className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                    {item.points} pt
                  </span>
                  {item.dueDate ? (
                    <span className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                      期限 {new Date(item.dueDate).toLocaleDateString()}
                    </span>
                  ) : null}
                  {item.assigneeId ? (
                    <span className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                      {members.find((member) => member.id === item.assigneeId)?.name ?? "担当"}
                    </span>
                  ) : null}
                  <button
                    onClick={() => markDone(item.id)}
                    className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                  >
                      完了
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="border border-slate-200 bg-white p-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                      aria-label="編集"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="border border-slate-200 bg-white p-1 text-slate-700 transition hover:border-red-300 hover:text-red-600"
                      aria-label="削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>

        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">完了</h3>
            <span className="text-xs text-slate-500">
              {items.filter((item) => item.status === TASK_STATUS.DONE).length} 件
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {items
              .filter((item) => item.status === TASK_STATUS.DONE)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600"
                >
                  <div>
                    <p className="font-semibold text-slate-700">{item.title}</p>
                    {item.description ? (
                      <p className="text-xs text-slate-500">{item.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
                      {item.points} pt
                    </span>
                    {item.dueDate ? (
                      <span className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
                        期限 {new Date(item.dueDate).toLocaleDateString()}
                      </span>
                    ) : null}
                    <button
                      onClick={() => openEdit(item)}
                      className="border border-slate-200 bg-white p-1 text-slate-600 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                      aria-label="編集"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="border border-slate-200 bg-white p-1 text-slate-600 transition hover:border-red-300 hover:text-red-600"
                      aria-label="削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
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
                  <span>
                    {(item as { completedPoints?: number }).completedPoints ?? 0} pt
                  </span>
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

        {editItem ? (
          <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4">
            <div className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">タスクを編集</h3>
                <button
                  onClick={() => setEditItem(null)}
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
                      onChange={(e) => setEditForm((p) => ({ ...p, urgency: e.target.value }))}
                      className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                    >
                      {["低", "中", "高"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-500">
                    リスク
                    <select
                      value={editForm.risk}
                      onChange={(e) => setEditForm((p) => ({ ...p, risk: e.target.value }))}
                      className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                    >
                      {["低", "中", "高"].map((v) => (
                        <option key={v}>{v}</option>
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
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, assigneeId: e.target.value }))
                      }
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
    </div>
  );
}
