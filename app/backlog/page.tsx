"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "../components/sidebar";
import { TASK_STATUS, TaskDTO } from "../../lib/types";

export default function BacklogPage() {
  const [items, setItems] = useState<TaskDTO[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    points: 3,
    urgency: "中",
    risk: "中",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setItems(data.tasks ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTasks();
  }, [fetchTasks]);

  const addItem = async () => {
    if (!form.title.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        points: Number(form.points),
        urgency: form.urgency,
        risk: form.risk,
        status: TASK_STATUS.BACKLOG,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setItems((prev) => [...prev, data.task]);
      setForm({ title: "", description: "", points: 3, urgency: "中", risk: "中" });
      setModalOpen(false);
    }
  };

  const moveToSprint = async (id: string) => {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: TASK_STATUS.SPRINT }),
    });
    void fetchTasks();
  };

  const getSuggestion = async (title: string) => {
    const res = await fetch("/api/ai/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const data = await res.json();
      setSuggestion(data.suggestion);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-10 lg:px-6 lg:py-14">
      <Sidebar splitThreshold={8} />
      <main className="flex-1 space-y-6">
        <header className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                Backlog
              </p>
              <h1 className="text-3xl font-semibold text-slate-900">バックログ</h1>
              <p className="text-sm text-slate-600">
                手入力＋後でインポートを追加。点数と緊急度/リスクをセットしてスプリントに送れるように。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  fetchTasks();
                  setModalOpen(true);
                }}
                className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30"
              >
                タスクを追加
              </button>
            </div>
          </div>
        </header>

        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3">
            {items
              .filter((item) => item.status === TASK_STATUS.BACKLOG)
              .map((item) => (
                <div
                  key={item.id}
                  className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
                        {item.points} pt
                      </span>
                      <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
                        緊急度: {item.urgency}
                      </span>
                      <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
                        リスク: {item.risk}
                      </span>
                    </div>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-sm text-slate-700">{item.description}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <button
                      className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                      onClick={() => moveToSprint(item.id)}
                    >
                      スプリントに送る
                    </button>
                    <button
                      className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                      onClick={() => getSuggestion(item.title)}
                    >
                      AI 提案を見る
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>

        {modalOpen ? (
          <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/20 px-4">
            <div className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">タスクを追加</h3>
                <button
                  onClick={() => setModalOpen(false)}
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
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    type="number"
                    min={1}
                    value={form.points}
                    onChange={(e) => setForm((p) => ({ ...p, points: Number(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                  <select
                    value={form.urgency}
                    onChange={(e) => setForm((p) => ({ ...p, urgency: e.target.value }))}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    {["低", "中", "高"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={form.risk}
                    onChange={(e) => setForm((p) => ({ ...p, risk: e.target.value }))}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    {["低", "中", "高"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={addItem}
                  className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30"
                >
                  追加する
                </button>
                {suggestion ? (
                  <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
                    {suggestion}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
