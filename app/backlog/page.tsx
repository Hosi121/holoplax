"use client";

import { Sparkles, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceId } from "../components/use-workspace-id";
import { LoadingButton } from "../components/loading-button";
import { TASK_STATUS, TASK_TYPE, TaskDTO, TaskType } from "../../lib/types";
import {
  DELEGATE_TAG,
  PENDING_APPROVAL_TAG,
  SPLIT_PARENT_TAG,
} from "../../lib/automation-constants";

const storyPoints = [1, 2, 3, 5, 8, 13, 21, 34];
const taskTypeLabels: Record<TaskType, string> = {
  [TASK_TYPE.EPIC]: "目標",
  [TASK_TYPE.PBI]: "PBI",
  [TASK_TYPE.TASK]: "タスク",
  [TASK_TYPE.ROUTINE]: "ルーティン",
};
const taskTypeOptions = [
  { value: TASK_TYPE.EPIC, label: "目標 (EPIC)" },
  { value: TASK_TYPE.PBI, label: "PBI" },
  { value: TASK_TYPE.TASK, label: "タスク" },
  { value: TASK_TYPE.ROUTINE, label: "ルーティン" },
];
const taskTypeOrder: TaskType[] = [
  TASK_TYPE.EPIC,
  TASK_TYPE.PBI,
  TASK_TYPE.TASK,
  TASK_TYPE.ROUTINE,
];
type SplitSuggestion = {
  title: string;
  points: number;
  urgency: string;
  risk: string;
  detail: string;
};

type AiPrepType = "EMAIL" | "IMPLEMENTATION" | "CHECKLIST";

type AiPrepOutput = {
  id: string;
  type: AiPrepType;
  status: "PENDING" | "APPROVED" | "APPLIED" | "REJECTED";
  output: string;
  createdAt: string;
};

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

const prepTypeOptions: { value: AiPrepType; label: string }[] = [
  { value: "CHECKLIST", label: "チェックリスト" },
  { value: "IMPLEMENTATION", label: "実装手順" },
  { value: "EMAIL", label: "メール草案" },
];

const prepTypeLabels: Record<AiPrepType, string> = {
  CHECKLIST: "チェックリスト",
  IMPLEMENTATION: "実装手順",
  EMAIL: "メール草案",
};

const prepStatusMeta: Record<
  AiPrepOutput["status"],
  { label: string; className: string }
> = {
  PENDING: {
    label: "承認待ち",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  APPROVED: {
    label: "承認済み",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  APPLIED: {
    label: "適用済み",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  REJECTED: {
    label: "却下",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
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
    type: TASK_TYPE.PBI as TaskType,
    parentId: "",
    dueDate: "",
    assigneeId: "",
    tags: "",
    dependencyIds: [] as string[],
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionMap, setSuggestionMap] = useState<
    Record<string, { text: string; suggestionId?: string | null }>
  >({});
  const [scoreHint, setScoreHint] = useState<string | null>(null);
  const [scoreMap, setScoreMap] = useState<
    Record<
      string,
      {
        points: number;
        urgency: string;
        risk: string;
        reason?: string;
        suggestionId?: string | null;
      }
    >
  >({});
  const [splitMap, setSplitMap] = useState<Record<string, SplitSuggestion[]>>({});
  const [splitSuggestionIdMap, setSplitSuggestionIdMap] = useState<
    Record<string, string | null>
  >({});
  const [editItem, setEditItem] = useState<TaskDTO | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    points: 3,
    urgency: "中",
    risk: "中",
    type: TASK_TYPE.PBI as TaskType,
    parentId: "",
    dueDate: "",
    assigneeId: "",
    tags: "",
    dependencyIds: [] as string[],
  });
  const [addLoading, setAddLoading] = useState(false);
  const [suggestLoadingId, setSuggestLoadingId] = useState<string | null>(null);
  const [splitLoadingId, setSplitLoadingId] = useState<string | null>(null);
  const [scoreLoadingId, setScoreLoadingId] = useState<string | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [approvalLoadingId, setApprovalLoadingId] = useState<string | null>(null);
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [prepTask, setPrepTask] = useState<TaskDTO | null>(null);
  const [prepType, setPrepType] = useState<AiPrepType>("CHECKLIST");
  const [prepOutputs, setPrepOutputs] = useState<AiPrepOutput[]>([]);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepFetchLoading, setPrepFetchLoading] = useState(false);
  const [prepActionLoadingId, setPrepActionLoadingId] = useState<string | null>(null);

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

  const taskById = useMemo(() => {
    const map = new Map<string, TaskDTO>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const childCount = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => {
      if (!item.parentId) return;
      map.set(item.parentId, (map.get(item.parentId) ?? 0) + 1);
    });
    return map;
  }, [items]);

  const visibleItems = useMemo(
    () =>
      items
        .filter((item) =>
          view === "product"
            ? item.status === TASK_STATUS.BACKLOG
            : item.status === TASK_STATUS.SPRINT,
        )
        .filter((item) => !item.tags?.includes(DELEGATE_TAG))
        .filter((item) => !item.tags?.includes(SPLIT_PARENT_TAG)),
    [items, view],
  );

  const groupedByType = useMemo(() => {
    const grouped: Record<TaskType, TaskDTO[]> = {
      [TASK_TYPE.EPIC]: [],
      [TASK_TYPE.PBI]: [],
      [TASK_TYPE.TASK]: [],
      [TASK_TYPE.ROUTINE]: [],
    };
    visibleItems.forEach((item) => {
      const type = (item.type ?? TASK_TYPE.PBI) as TaskType;
      grouped[type].push(item);
    });
    return grouped;
  }, [visibleItems]);

  const parentCandidates = useMemo(
    () =>
      items.filter((item) => {
        const type = (item.type ?? TASK_TYPE.PBI) as TaskType;
        return type === TASK_TYPE.EPIC || type === TASK_TYPE.PBI;
      }),
    [items],
  );

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
          type: form.type,
          parentId: form.parentId || null,
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
          type: view === "sprint" ? TASK_TYPE.TASK : TASK_TYPE.PBI,
          parentId: "",
          dueDate: "",
          assigneeId: "",
          tags: "",
          dependencyIds: [],
        });
        setModalOpen(false);
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data?.error ?? "タスクの追加に失敗しました。");
      }
    } finally {
      setAddLoading(false);
    }
  };

  const moveToSprint = async (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: TASK_STATUS.SPRINT } : item)),
    );
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: TASK_STATUS.SPRINT }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data?.error ?? "スプリントへの移動に失敗しました。");
      void fetchTasks();
      return;
    }
    void fetchTasks();
  };

  const moveToBacklog = async (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: TASK_STATUS.BACKLOG } : item)),
    );
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: TASK_STATUS.BACKLOG }),
    });
    if (!res.ok) {
      void fetchTasks();
      return;
    }
    void fetchTasks();
  };

  const getSuggestion = async (title: string, description?: string, taskId?: string) => {
    setSuggestLoadingId(taskId ?? title);
    try {
      if (taskId) {
        const cached = await fetch(
          `/api/ai/suggest?taskId=${encodeURIComponent(taskId)}`,
        );
        if (cached.ok) {
          const data = await cached.json();
          if (data.suggestion !== null && data.suggestion !== undefined) {
            setSuggestionMap((prev) => ({
              ...prev,
              [taskId]: { text: data.suggestion, suggestionId: data.suggestionId },
            }));
            return;
          }
        }
      }
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, taskId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (taskId) {
        setSuggestionMap((prev) => ({
          ...prev,
          [taskId]: { text: data.suggestion, suggestionId: data.suggestionId },
        }));
      } else {
        setSuggestion(data.suggestion);
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

  const estimateScoreForTask = async (item: TaskDTO) => {
    setScoreLoadingId(item.id);
    try {
      const res = await fetch("/api/ai/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          description: item.description ?? "",
          taskId: item.id,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScoreMap((prev) => ({
        ...prev,
        [item.id]: {
          points: Number(data.points) || item.points,
          urgency: data.urgency ?? item.urgency,
          risk: data.risk ?? item.risk,
          reason: data.reason,
          suggestionId: data.suggestionId,
        },
      }));
    } finally {
      setScoreLoadingId(null);
    }
  };

  const applyTipSuggestion = async (itemId: string) => {
    const suggestion = suggestionMap[itemId];
    if (!suggestion) return;
    await fetch("/api/ai/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: itemId,
        type: "TIP",
        suggestionId: suggestion.suggestionId,
        payload: { text: suggestion.text },
      }),
    });
    void fetchTasks();
  };

  const applyScoreSuggestion = async (itemId: string) => {
    const score = scoreMap[itemId];
    if (!score) return;
    await fetch("/api/ai/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: itemId,
        type: "SCORE",
        suggestionId: score.suggestionId,
        payload: {
          points: score.points,
          urgency: score.urgency,
          risk: score.risk,
        },
      }),
    });
    void fetchTasks();
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
        setSplitSuggestionIdMap((prev) => ({
          ...prev,
          [item.id]: data.suggestionId ?? null,
        }));
      }
    } finally {
      setSplitLoadingId(null);
    }
  };

  const applySplit = async (item: TaskDTO) => {
    const suggestions = splitMap[item.id] ?? [];
    if (!suggestions.length) return;
    const nextTags = Array.from(new Set([...(item.tags ?? []), SPLIT_PARENT_TAG]));
    setItems((prev) =>
      prev.map((t) => (t.id === item.id ? { ...t, tags: nextTags } : t)),
    );
    setSplitMap((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setSplitSuggestionIdMap((prev) => {
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
            type: TASK_TYPE.TASK,
            parentId: item.id,
          }),
        }),
      ),
    );
    await fetch(`/api/tasks/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: nextTags }),
    });
    await fetch("/api/ai/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: item.id,
        type: "SPLIT",
        suggestionId: splitSuggestionIdMap[item.id] ?? null,
      }),
    });
    await fetchTasks();
  };

  const loadPrepOutputs = useCallback(
    async (taskId: string) => {
      setPrepFetchLoading(true);
      try {
        const res = await fetch(`/api/ai/prep?taskId=${taskId}`);
        if (!res.ok) return;
        const data = await res.json();
        setPrepOutputs(data.outputs ?? []);
      } finally {
        setPrepFetchLoading(false);
      }
    },
    [],
  );

  const openPrepModal = (item: TaskDTO) => {
    setPrepTask(item);
    setPrepType("CHECKLIST");
    setPrepModalOpen(true);
    void loadPrepOutputs(item.id);
  };

  const closePrepModal = () => {
    setPrepModalOpen(false);
    setPrepTask(null);
    setPrepOutputs([]);
  };

  const generatePrepOutput = async () => {
    if (!prepTask) return;
    setPrepLoading(true);
    try {
      const res = await fetch("/api/ai/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: prepTask.id, type: prepType }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.output) {
        setPrepOutputs((prev) => [data.output, ...prev]);
      }
    } finally {
      setPrepLoading(false);
    }
  };

  const updatePrepOutput = async (output: AiPrepOutput, action: string) => {
    setPrepActionLoadingId(`${output.id}-${action}`);
    try {
      const res = await fetch(`/api/ai/prep/${output.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.output) {
        setPrepOutputs((prev) =>
          prev.map((item) => (item.id === data.output.id ? data.output : item)),
        );
      }
      if (action === "apply" || action === "revert") {
        void fetchTasks();
      }
    } finally {
      setPrepActionLoadingId(null);
    }
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
      type: item.type ?? TASK_TYPE.PBI,
      parentId: item.parentId ?? "",
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
        type: editForm.type,
        parentId: editForm.parentId || null,
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
    setApprovalLoadingId(id);
    try {
      await fetch("/api/automation/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: id, action: "approve" }),
      });
      void fetchTasks();
    } finally {
      setApprovalLoadingId(null);
    }
  };

  const rejectAutomation = async (id: string) => {
    setApprovalLoadingId(id);
    try {
      await fetch("/api/automation/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: id, action: "reject" }),
      });
      void fetchTasks();
    } finally {
      setApprovalLoadingId(null);
    }
  };

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
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
                className={`px-3 py-1 transition ${view === "product"
                  ? "bg-[#2323eb]/10 text-[#2323eb]"
                  : "text-slate-600 hover:text-[#2323eb]"
                  }`}
              >
                目標リスト
              </button>
              <button
                onClick={() => setView("sprint")}
                className={`px-3 py-1 transition ${view === "sprint"
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
                setForm((prev) => ({
                  ...prev,
                  type: view === "sprint" ? TASK_TYPE.TASK : TASK_TYPE.PBI,
                  parentId: "",
                }));
                setModalOpen(true);
              }}
              className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/30"
            >
              タスクを追加
            </button>
          </div>
        </div>
      </header>

      {items.filter(
        (item) =>
          item.status === TASK_STATUS.BACKLOG && item.tags?.includes(DELEGATE_TAG),
      ).length ? (
        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">AI委任キュー</h2>
            <span className="text-xs text-slate-500">
              {
                items.filter(
                  (item) =>
                    item.status === TASK_STATUS.BACKLOG &&
                    item.tags?.includes(DELEGATE_TAG),
                ).length
              }{" "}
              件
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
                    <LoadingButton
                      onClick={() => approveAutomation(item.id)}
                      loading={approvalLoadingId === item.id}
                      className="border border-emerald-300 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 transition hover:border-emerald-400"
                    >
                      承認して分解
                    </LoadingButton>
                    <button
                      onClick={() => rejectAutomation(item.id)}
                      disabled={approvalLoadingId === item.id}
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
        <div className="grid gap-5">
          {taskTypeOrder.map((type) => {
            const bucket = groupedByType[type];
            if (!bucket.length) return null;
            return (
              <div key={type} className="grid gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {taskTypeLabels[type]}
                  </h2>
                  <span className="text-xs text-slate-500">{bucket.length} 件</span>
                </div>
                <div className="grid gap-3">
                  {bucket.map((item) => (
                    <div
                      key={item.id}
                      className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="border border-slate-200 bg-white px-2 py-1 text-slate-600">
                            {taskTypeLabels[(item.type ?? TASK_TYPE.PBI) as TaskType]}
                          </span>
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
                        <LoadingButton
                          className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                          onClick={() => estimateScoreForTask(item)}
                          loading={scoreLoadingId === item.id}
                        >
                          AIでスコア推定
                        </LoadingButton>
                        <button
                          className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                          onClick={() => openPrepModal(item)}
                        >
                          AIで下準備
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
                          <p>{suggestionMap[item.id].text}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => applyTipSuggestion(item.id)}
                              className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300"
                            >
                              適用
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {scoreMap[item.id] ? (
                        <div className="mt-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                            Score suggestion
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                            <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                              {scoreMap[item.id].points} pt
                            </span>
                            <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                              緊急度: {scoreMap[item.id].urgency}
                            </span>
                            <span className="border border-slate-200 bg-slate-50 px-2 py-1">
                              リスク: {scoreMap[item.id].risk}
                            </span>
                          </div>
                          {scoreMap[item.id].reason ? (
                            <p className="mt-2 text-[11px] text-slate-500">
                              {scoreMap[item.id].reason}
                            </p>
                          ) : null}
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => applyScoreSuggestion(item.id)}
                              className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300"
                            >
                              適用
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        {item.parentId ? (
                          <span className="border border-slate-200 bg-white px-2 py-1">
                            親: {taskById.get(item.parentId)?.title ?? "未設定"}
                          </span>
                        ) : null}
                        {childCount.get(item.id) ? (
                          <span className="border border-slate-200 bg-white px-2 py-1">
                            子: {childCount.get(item.id)} 件
                          </span>
                        ) : null}
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
                            className={`border px-2 py-1 ${isBlocked(item)
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
                              <div
                                key={`${item.id}-${idx}`}
                                className="flex items-start justify-between gap-3"
                              >
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
              </div>
            );
          })}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-500">
                  種別
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, type: e.target.value as TaskType }))
                    }
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
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, dependencyIds: [] }))}
                  className="w-fit text-[11px] text-slate-500 transition hover:text-[#2323eb]"
                >
                  選択を解除
                </button>
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

      {prepModalOpen && prepTask ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">AI下準備</h3>
                <p className="text-xs text-slate-500">{prepTask.title}</p>
              </div>
              <button
                onClick={closePrepModal}
                className="text-sm text-slate-500 transition hover:text-slate-800"
              >
                閉じる
              </button>
            </div>
            <div className="mt-4 grid gap-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  value={prepType}
                  onChange={(e) => setPrepType(e.target.value as AiPrepType)}
                  className="border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
                >
                  {prepTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <LoadingButton
                  className="border border-slate-200 bg-slate-50 px-4 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
                  onClick={generatePrepOutput}
                  loading={prepLoading}
                >
                  生成
                </LoadingButton>
                {prepFetchLoading ? (
                  <span className="text-xs text-slate-500">読み込み中...</span>
                ) : null}
              </div>
              {prepOutputs.length ? (
                <div className="grid gap-3">
                  {prepOutputs.map((output) => (
                    <div
                      key={output.id}
                      className="border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                          {prepTypeLabels[output.type]}
                        </span>
                        <span
                          className={`border px-2 py-1 text-[11px] ${prepStatusMeta[output.status].className}`}
                        >
                          {prepStatusMeta[output.status].label}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                        {output.output}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        {output.status === "PENDING" ? (
                          <>
                            <button
                              onClick={() => updatePrepOutput(output, "approve")}
                              disabled={prepActionLoadingId === `${output.id}-approve`}
                              className="border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-50"
                            >
                              承認
                            </button>
                            <button
                              onClick={() => updatePrepOutput(output, "reject")}
                              disabled={prepActionLoadingId === `${output.id}-reject`}
                              className="border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-700 transition hover:border-rose-300 disabled:opacity-50"
                            >
                              却下
                            </button>
                          </>
                        ) : null}
                        {output.status === "APPROVED" ? (
                          <button
                            onClick={() => updatePrepOutput(output, "apply")}
                            disabled={prepActionLoadingId === `${output.id}-apply`}
                            className="border border-sky-200 bg-sky-50 px-2 py-1 font-semibold text-sky-700 transition hover:border-sky-300 disabled:opacity-50"
                          >
                            適用
                          </button>
                        ) : null}
                        {output.status === "APPLIED" ? (
                          <button
                            onClick={() => updatePrepOutput(output, "revert")}
                            disabled={prepActionLoadingId === `${output.id}-revert`}
                            className="border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-50"
                          >
                            取り消し
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  まだ下準備がありません。タイプを選んで生成してください。
                </p>
              )}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-500">
                  種別
                  <select
                    value={editForm.type}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, type: e.target.value as TaskType }))
                    }
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
                    value={editForm.parentId}
                    onChange={(e) => setEditForm((p) => ({ ...p, parentId: e.target.value }))}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    <option value="">未設定</option>
                    {parentCandidates
                      .filter((candidate) => candidate.id !== editItem?.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.title}
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
                <button
                  type="button"
                  onClick={() => setEditForm((p) => ({ ...p, dependencyIds: [] }))}
                  className="w-fit text-[11px] text-slate-500 transition hover:text-[#2323eb]"
                >
                  選択を解除
                </button>
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
  );
}
