"use client";

import { Sparkles, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "../components/sidebar";
import { useWorkspaceId } from "../components/use-workspace-id";
import { LoadingButton } from "../components/loading-button";
import { TASK_STATUS, TaskDTO } from "../../lib/types";
import {
  DELEGATE_TAG,
  PENDING_APPROVAL_TAG,
  SPLIT_PARENT_TAG,
} from "../../lib/automation-constants";

const storyPoints = [1, 2, 3, 5, 8, 13, 21, 34];
type SplitSuggestion = {
  title: string;
  points: number;
  urgency: string;
  risk: string;
  detail: string;
};

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

export default function BacklogPage() {
  const splitThreshold = 8;
  const { workspaceId, ready } = useWorkspaceId();
  const [items, setItems] = useState<TaskDTO[]>([]);
  const [view, setView] = useState<"product" | "sprint">("product");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    points: 3,
    urgency: "中",
    risk: "中",
    dueDate: "",
    assigneeId: "",
    tags: "",
    dependencyIds: [] as string[],
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionMap, setSuggestionMap] = useState<Record<string, string>>({});
  const [scoreHint, setScoreHint] = useState<string | null>(null);
  const [splitMap, setSplitMap] = useState<Record<string, SplitSuggestion[]>>({});
  const [editItem, setEditItem] = useState<TaskDTO | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    points: 3,
    urgency: "中",
    risk: "中",
    dueDate: "",
    assigneeId: "",
    tags: "",
    dependencyIds: [] as string[],
  });
  const [addLoading, setAddLoading] = useState(false);
  const [suggestLoadingId, setSuggestLoadingId] = useState<string | null>(null);
  const [splitLoadingId, setSplitLoadingId] = useState<string | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

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
    void fetchMembers();
  }, [fetchTasks, fetchMembers]);

  const isBlocked = (item: TaskDTO) =>
    (item.dependencies ?? []).some((dep) => dep.status !== TASK_STATUS.DONE);

  const addItem = async () => {
    if (!form.title.trim()) return;
    const statusValue =
      view === "sprint" ? TASK_STATUS.SPRINT : TASK_STATUS.BACKLOG;
    setAddLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          points: Number(form.points),
          urgency: form.urgency,
          risk: form.risk,
          status: statusValue,
          dueDate: form.dueDate || null,
          assigneeId: form.assigneeId || null,
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          dependencyIds: form.dependencyIds,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setItems((prev) => [...prev, data.task]);
        if (data.task.points > splitThreshold && data.task.status === TASK_STATUS.BACKLOG) {
          // しきい値超過の場合は即座に分解案を取得して表示
          void requestSplit(data.task);
        }
        setForm({
          title: "",
          description: "",
          points: 3,
          urgency: "中",
          risk: "中",
          dueDate: "",
          assigneeId: "",
          tags: "",
          dependencyIds: [],
        });
        setModalOpen(false);
      }
    } finally {
      setAddLoading(false);
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

  const moveToBacklog = async (id: string) => {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: TASK_STATUS.BACKLOG }),
    });
    void fetchTasks();
  };

  const getSuggestion = async (title: string, description?: string, taskId?: string) => {
    setSuggestLoadingId(taskId ?? title);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, taskId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (taskId) {
          setSuggestionMap((prev) => ({ ...prev, [taskId]: data.suggestion }));
        } else {
          setSuggestion(data.suggestion);
        }
      }
    } finally {
      setSuggestLoadingId(null);
    }
  };

  const estimateScore = async () => {
    if (!form.title.trim()) return;
    setScoreHint(null);
    setScoreLoading(true);
    try {
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
    } finally {
      setScoreLoading(false);
    }
  };

  const requestSplit = async (item: TaskDTO) => {
    setSplitLoadingId(item.id);
    try {
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
    } finally {
      setSplitLoadingId(null);
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
    const statusValue =
      view === "sprint" ? TASK_STATUS.SPRINT : TASK_STATUS.BACKLOG;
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
            status: statusValue,
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
      dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : "",
      assigneeId: item.assigneeId ?? "",
      tags: item.tags?.join(", ") ?? "",
      dependencyIds: item.dependencyIds ?? [],
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
        dependencyIds: editForm.dependencyIds,
      }),
    });
    setEditItem(null);
    await fetchTasks();
  };

  const approveAutomation = async (id: string) => {
    await fetch("/api/automation/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: id, action: "approve" }),
    });
    void fetchTasks();
  };

  const rejectAutomation = async (id: string) => {
    await fetch("/api/automation/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: id, action: "reject" }),
    });
    void fetchTasks();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-10 lg:px-6 lg:py-14">
      <Sidebar />
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
              <div className="flex items-center gap-2 border border-slate-200 bg-white p-1 text-xs text-slate-700">
                <button
                  onClick={() => setView("product")}
                  className={`px-3 py-1 transition ${
                    view === "product"
                      ? "bg-[#2323eb]/10 text-[#2323eb]"
                      : "text-slate-600 hover:text-[#2323eb]"
                  }`}
                >
                  目標リスト
                </button>
                <button
                  onClick={() => setView("sprint")}
                  className={`px-3 py-1 transition ${
                    view === "sprint"
                      ? "bg-[#2323eb]/10 text-[#2323eb]"
                      : "text-slate-600 hover:text-[#2323eb]"
                  }`}
                >
                  スプリントバックログ
                </button>
              </div>
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

        {items.filter((item) => item.tags?.includes(DELEGATE_TAG)).length ? (
          <section className="border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">AI委任キュー</h2>
              <span className="text-xs text-slate-500">
                {items.filter((item) => item.tags?.includes(DELEGATE_TAG)).length} 件
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              {items
                .filter(
                  (item) =>
                    item.status === TASK_STATUS.BACKLOG && item.tags?.includes(DELEGATE_TAG),
                )
                .map((item) => (
                  <div
                    key={item.id}
                    className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-800"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <span className="border border-amber-200 bg-white px-2 py-1 text-xs text-amber-700">
                        AI委任候補
                      </span>
                    </div>
                    {item.description ? (
                      <p className="mt-1 text-xs text-slate-700">{item.description}</p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        {item.points} pt
                      </span>
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        緊急度: {item.urgency}
                      </span>
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        リスク: {item.risk}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ) : null}

        {items.filter((item) => item.tags?.includes(PENDING_APPROVAL_TAG)).length ? (
          <section className="border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">自動分解 承認待ち</h2>
              <span className="text-xs text-slate-500">
                {items.filter((item) => item.tags?.includes(PENDING_APPROVAL_TAG)).length} 件
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {items
                .filter((item) => item.tags?.includes(PENDING_APPROVAL_TAG))
                .map((item) => (
                  <div
                    key={item.id}
                    className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-800"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <span className="border border-amber-200 bg-white px-2 py-1 text-[11px] text-amber-700">
                        承認待ち
                      </span>
                    </div>
                    {item.description ? (
                      <p className="mt-1 text-xs text-slate-700">{item.description}</p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        {item.points} pt
                      </span>
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        緊急度: {item.urgency}
                      </span>
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        リスク: {item.risk}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() => approveAutomation(item.id)}
                        className="border border-emerald-300 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 transition hover:border-emerald-400"
                      >
                        承認して分解
                      </button>
                      <button
                        onClick={() => rejectAutomation(item.id)}
                        className="border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:border-slate-300"
                      >
                        却下
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ) : null}

        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3">
            {items
              .filter((item) =>
                view === "product"
                  ? item.status === TASK_STATUS.BACKLOG
                  : item.status === TASK_STATUS.SPRINT,
              )
              .filter((item) => !item.tags?.includes(DELEGATE_TAG))
              .filter((item) => !item.tags?.includes(SPLIT_PARENT_TAG))
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
                      {item.tags?.includes(PENDING_APPROVAL_TAG) ? (
                        <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                          承認待ち
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-sm text-slate-700">{item.description}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    {view === "product" ? (
                      <button
                        className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                        onClick={() => {
                          if (isBlocked(item)) {
                            window.alert("依存タスクが未完了のため移動できません。");
                            return;
                          }
                          moveToSprint(item.id);
                        }}
                      >
                        スプリントに送る
                      </button>
                    ) : (
                      <button
                        className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                        onClick={() => moveToBacklog(item.id)}
                      >
                        目標リストに戻す
                      </button>
                    )}
                    <LoadingButton
                      className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                      onClick={() => getSuggestion(item.title, item.description, item.id)}
                      loading={suggestLoadingId === item.id}
                    >
                      AI 提案を見る
                    </LoadingButton>
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
                      <LoadingButton
                        className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                        onClick={() => requestSplit(item)}
                        loading={splitLoadingId === item.id}
                      >
                        分解提案
                      </LoadingButton>
                    ) : null}
                  </div>
                  {suggestionMap[item.id] ? (
                    <div className="mt-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                      {suggestionMap[item.id]}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    {item.dueDate ? (
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        期限: {new Date(item.dueDate).toLocaleDateString()}
                      </span>
                    ) : null}
                    {item.assigneeId ? (
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        担当:{" "}
                        {members.find((member) => member.id === item.assigneeId)?.name ??
                          "未設定"}
                      </span>
                    ) : null}
                    {item.tags && item.tags.length > 0 ? (
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        #{item.tags.join(" #")}
                      </span>
                    ) : null}
                    {item.dependencies && item.dependencies.length > 0 ? (
                      <span
                        className={`border px-2 py-1 ${
                          isBlocked(item)
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-white"
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
                      </span>
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

        {items.filter((item) => item.tags?.includes(SPLIT_PARENT_TAG)).length ? (
          <section className="border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">自動分解済み (元タスク)</h2>
              <span className="text-xs text-slate-500">
                {
                  items.filter(
                    (item) =>
                      item.tags?.includes(SPLIT_PARENT_TAG) &&
                      !item.tags?.includes(PENDING_APPROVAL_TAG),
                  ).length
                }{" "}
                件
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {items
                .filter(
                  (item) =>
                    item.tags?.includes(SPLIT_PARENT_TAG) &&
                    !item.tags?.includes(PENDING_APPROVAL_TAG),
                )
                .map((item) => (
                  <div
                    key={item.id}
                    className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <span className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                        分解済み
                      </span>
                    </div>
                    {item.description ? (
                      <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-slate-500">
                      自動分解で子タスクを作成しました。親は情報保持のみ。
                    </p>
                  </div>
                ))}
            </div>
          </section>
        ) : null}

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
                    <select
                      value={form.points}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, points: Number(e.target.value) || 1 }))
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
                          {member.name ?? member.email ?? member.id}
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
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={addItem}
                    disabled={addLoading}
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
                  </button>
                  <LoadingButton
                    onClick={estimateScore}
                    disabled={scoreLoading}
                    loading={scoreLoading}
                    className="inline-flex items-center gap-2 border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-60"
                  >
                    {!scoreLoading ? <Sparkles size={16} /> : null}
                    AIでスコア推定
                  </LoadingButton>
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
                <label className="grid gap-1 text-xs text-slate-500">
                  依存タスク
                  <select
                    multiple
                    value={editForm.dependencyIds}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions).map(
                        (option) => option.value,
                      );
                      setEditForm((p) => ({ ...p, dependencyIds: selected }));
                    }}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    {items
                      .filter((candidate) => candidate.id !== editItem?.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.title}
                        </option>
                      ))}
                  </select>
                </label>
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
