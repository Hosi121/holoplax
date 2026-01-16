"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/sidebar";
import { useWorkspaceId } from "../components/use-workspace-id";
import { TASK_STATUS, TaskDTO } from "../../lib/types";

export default function SprintPage() {
  const capacity = 24;
  const { workspaceId, ready } = useWorkspaceId();
  const [items, setItems] = useState<TaskDTO[]>([]);
  const [newItem, setNewItem] = useState({ title: "", description: "", points: 1 });
  const [editItem, setEditItem] = useState<TaskDTO | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    points: 1,
    urgency: "中",
    risk: "中",
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTasks();
  }, [fetchTasks]);

  const used = useMemo(
    () => items.filter((i) => i.status !== TASK_STATUS.DONE).reduce((sum, i) => sum + i.points, 0),
    [items],
  );
  const remaining = capacity - used;

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
      }),
    });
    setNewItem({ title: "", description: "", points: 1 });
    fetchTasks();
  };

  const markDone = async (id: string) => {
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
      }),
    });
    setEditItem(null);
    fetchTasks();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-10 lg:px-6 lg:py-14">
      <Sidebar splitThreshold={8} />
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
                キャパ 24 pt
              </span>
              <span className="border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                残り {remaining} pt
              </span>
              <button className="bg-[#2323eb] px-4 py-2 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30">
                スプリント開始
              </button>
            </div>
          </div>
        </header>

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
                <input
                  type="number"
                  min={1}
                  placeholder="pt"
                  value={newItem.points}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, points: Number(e.target.value) || 0 }))
                  }
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
              </label>
              <button
                onClick={addItem}
                disabled={newItem.points > remaining}
                className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb] disabled:opacity-50"
              >
                追加
              </button>
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
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                      {item.points} pt
                    </span>
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
                    <input
                      type="number"
                      min={1}
                      placeholder="pt"
                      value={editForm.points}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, points: Number(e.target.value) || 0 }))
                      }
                      className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                    />
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
