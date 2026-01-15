"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/sidebar";
import { TASK_STATUS, TaskDTO } from "../../lib/types";

export default function SprintPage() {
  const capacity = 24;
  const [items, setItems] = useState<TaskDTO[]>([]);
  const [newItem, setNewItem] = useState({ title: "", description: "", points: 1 });

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setItems((data.tasks ?? []).filter((t: TaskDTO) => t.status !== TASK_STATUS.BACKLOG));
  }, []);

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
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
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
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={newItem.points}
                onChange={(e) => setNewItem((p) => ({ ...p, points: Number(e.target.value) || 0 }))}
                className="w-24 border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              />
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
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
              >
                <div>
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  {item.description ? (
                    <p className="text-xs text-slate-600">{item.description}</p>
                  ) : null}
                  <p className="text-xs text-slate-600">ステータス: {item.status}</p>
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
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
