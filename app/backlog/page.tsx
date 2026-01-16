"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "../components/sidebar";
import { useWorkspaceId } from "../components/use-workspace-id";
import { TASK_STATUS, TaskDTO } from "../../lib/types";

type SplitSuggestion = {
  title: string;
  points: number;
  urgency: string;
  risk: string;
  detail: string;
};

export default function BacklogPage() {
  const splitThreshold = 8;
  const { workspaceId, ready } = useWorkspaceId();
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
  const [scoreHint, setScoreHint] = useState<string | null>(null);
  const [splitMap, setSplitMap] = useState<Record<string, SplitSuggestion[]>>({});
  const [editItem, setEditItem] = useState<TaskDTO | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    points: 3,
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
    setItems(data.tasks ?? []);
  }, [ready, workspaceId]);

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

  const getSuggestion = async (title: string, description?: string, taskId?: string) => {
    const res = await fetch("/api/ai/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, taskId }),
    });
    if (res.ok) {
      const data = await res.json();
      setSuggestion(data.suggestion);
    }
  };

  const estimateScore = async () => {
    if (!form.title.trim()) return;
    setScoreHint(null);
    const res = await fetch("/api/ai/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title.trim(), description: form.description.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setForm((prev) => ({
        ...prev,
        points: Number(data.points) || prev.points,
        urgency: data.urgency ?? prev.urgency,
        risk: data.risk ?? prev.risk,
      }));
      setScoreHint(data.reason ?? `AI推定スコア: ${data.score}`);
    }
  };

  const requestSplit = async (item: TaskDTO) => {
    const res = await fetch("/api/ai/split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title,
        description: item.description ?? "",
        points: item.points,
        taskId: item.id,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setSplitMap((prev) => ({ ...prev, [item.id]: data.suggestions ?? [] }));
    }
  };

  const applySplit = async (item: TaskDTO) => {
    const suggestions = splitMap[item.id] ?? [];
    if (!suggestions.length) return;
    setItems((prev) => prev.filter((t) => t.id !== item.id));
    setSplitMap((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    await Promise.all(
      suggestions.map((split) =>
        fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: split.title,
            description: split.detail,
            points: split.points,
            urgency: split.urgency ?? "中",
            risk: split.risk ?? "中",
            status: TASK_STATUS.BACKLOG,
          }),
        }),
      ),
    );
    await fetch(`/api/tasks/${item.id}`, { method: "DELETE" });
    await fetchTasks();
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm("このタスクを削除しますか？")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await fetchTasks();
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
    await fetchTasks();
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
                      onClick={() => getSuggestion(item.title, item.description, item.id)}
                    >
                      AI 提案を見る
                    </button>
                    <button
                      className="border border-slate-200 bg-white p-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                      onClick={() => openEdit(item)}
                      aria-label="編集"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="border border-slate-200 bg-white p-1 text-slate-700 transition hover:border-red-300 hover:text-red-600"
                      onClick={() => deleteItem(item.id)}
                      aria-label="削除"
                    >
                      <Trash2 size={14} />
                    </button>
                    {item.points > splitThreshold ? (
                      <button
                        className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                        onClick={() => requestSplit(item)}
                      >
                        分解提案
                      </button>
                    ) : null}
                  </div>
                  {splitMap[item.id]?.length ? (
                    <div className="mt-3 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        Split suggestions
                      </p>
                      <div className="mt-2 grid gap-2">
                        {splitMap[item.id].map((split, idx) => (
                          <div key={`${item.id}-${idx}`} className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">{split.title}</p>
                              <p className="text-[11px] text-slate-600">{split.detail}</p>
                            </div>
                            <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                              {split.points} pt
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => applySplit(item)}
                          className="border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
                        >
                          この分解をバックログに追加
                        </button>
                      </div>
                    </div>
                  ) : null}
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
                  <label className="grid gap-1 text-xs text-slate-500">
                    ポイント
                    <input
                      type="number"
                      min={1}
                      placeholder="pt"
                      value={form.points}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, points: Number(e.target.value) || 0 }))
                      }
                      className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-500">
                    緊急度
                    <select
                      value={form.urgency}
                      onChange={(e) => setForm((p) => ({ ...p, urgency: e.target.value }))}
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
                      value={form.risk}
                      onChange={(e) => setForm((p) => ({ ...p, risk: e.target.value }))}
                      className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                    >
                      {["低", "中", "高"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={addItem}
                    className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30"
                  >
                    追加する
                  </button>
                  <button
                    onClick={estimateScore}
                    className="border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
                  >
                    AIでスコア推定
                  </button>
                </div>
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
              </div>
            </div>
          </div>
        ) : null}

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
                  placeholder="タイトル"
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
                  <input
                    type="number"
                    min={1}
                    value={editForm.points}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, points: Number(e.target.value) || 0 }))
                    }
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                  <select
                    value={editForm.urgency}
                    onChange={(e) => setEditForm((p) => ({ ...p, urgency: e.target.value }))}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    {["低", "中", "高"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={editForm.risk}
                    onChange={(e) => setEditForm((p) => ({ ...p, risk: e.target.value }))}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    {["低", "中", "高"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
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
