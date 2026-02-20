"use client";

import { CheckSquare, Filter, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  AUTOMATION_STATE,
  SEVERITY,
  SEVERITY_LABELS,
  type Severity,
  TASK_STATUS,
  TASK_TYPE,
  type TaskDTO,
  type TaskStatus,
  type TaskType,
} from "../../lib/types";
import { FocusPanel } from "../components/focus-panel";
import { HelpTooltip } from "../components/help-tooltip";
import { LoadingButton } from "../components/loading-button";
import { type AiSuggestionConfig, TaskCard } from "../components/task-card";
import { useToast } from "../components/toast";
import { useWorkspaceId } from "../components/use-workspace-id";
import { useAiSuggestions } from "./hooks/use-ai-suggestions";
import { useBulkOperations } from "./hooks/use-bulk-operations";
import { useProactiveSuggestionsList } from "./hooks/use-proactive-suggestions";
import { useSuggestionContext } from "./hooks/use-suggestion-context";
import { useTaskSearch } from "./hooks/use-task-search";

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
const checklistFromText = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      id: `${Date.now()}-${index}`,
      text: line,
      done: false,
    }));

const checklistToText = (checklist?: { id: string; text: string; done: boolean }[] | null) =>
  (checklist ?? []).map((item) => item.text).join("\n");
const severityOptions: Severity[] = [SEVERITY.LOW, SEVERITY.MEDIUM, SEVERITY.HIGH];

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

const prepStatusMeta: Record<AiPrepOutput["status"], { label: string; className: string }> = {
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
  const toast = useToast();
  const [items, setItems] = useState<TaskDTO[]>([]);

  // Proactive suggestions (Beyond Agency)
  const { context: aiContext } = useSuggestionContext();
  const proactiveSuggestionsMap = useProactiveSuggestionsList(items, aiContext);
  const [view, setView] = useState<"product" | "sprint">("product");

  // Search and filter
  const {
    filters,
    updateFilter,
    resetFilters,
    hasActiveFilters,
    buildQueryParams,
    isFilterOpen,
    setIsFilterOpen,
  } = useTaskSearch();

  // Bulk operations
  const {
    selectedIds,
    isSelectionMode,
    loading: bulkLoading,
    toggleSelection,
    selectAll,
    clearSelection,
    toggleSelectionMode,
    bulkUpdateStatus,
    bulkDelete,
    bulkUpdatePoints,
    selectedCount,
  } = useBulkOperations(() => {
    void fetchTasks();
  });

  // Fetch functions need to be defined before useAiSuggestions
  const fetchTasksByStatus = useCallback(async (statuses: TaskStatus[], searchParams?: string) => {
    const params = statuses.map((status) => `status=${encodeURIComponent(status)}`).join("&");
    const searchQuery = searchParams ? `&${searchParams}` : "";
    const res = await apiFetch(`/api/tasks?${params}&limit=200${searchQuery}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tasks ?? [];
  }, []);

  const fetchTasks = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setItems([]);
      return;
    }
    const searchParams = buildQueryParams();
    const [backlogTasks, sprintTasks] = await Promise.all([
      fetchTasksByStatus([TASK_STATUS.BACKLOG], searchParams),
      fetchTasksByStatus([TASK_STATUS.SPRINT], searchParams),
    ]);
    const mergedMap = new Map<string, TaskDTO>();
    [...backlogTasks, ...sprintTasks].forEach((task) => {
      mergedMap.set(task.id, task);
    });
    setItems(Array.from(mergedMap.values()));
  }, [ready, workspaceId, fetchTasksByStatus, buildQueryParams]);

  // AI Suggestions hook
  const {
    suggestionMap,
    scoreMap,
    splitMap,
    suggestLoadingId,
    scoreLoadingId,
    splitLoadingId,
    getSuggestion,
    estimateScoreForTask,
    applyTipSuggestion,
    applyScoreSuggestion,
    dismissTip,
    dismissScore,
    requestSplit,
    applySplit,
    rejectSplit,
  } = useAiSuggestions({ fetchTasks, setItems, context: aiContext });
  const createDefaultForm = () => ({
    title: "",
    description: "",
    definitionOfDone: "",
    checklistText: "",
    points: 3,
    urgency: SEVERITY.MEDIUM as Severity,
    risk: SEVERITY.MEDIUM as Severity,
    type: (view === "sprint" ? TASK_TYPE.TASK : TASK_TYPE.PBI) as TaskType,
    parentId: "",
    dueDate: "",
    assigneeId: "",
    tags: "",
    routineCadence: "NONE",
    dependencyIds: [] as string[],
  });
  const [form, setForm] = useState(createDefaultForm);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [scoreHint, setScoreHint] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<TaskDTO | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    definitionOfDone: "",
    checklistText: "",
    points: 3,
    urgency: SEVERITY.MEDIUM as Severity,
    risk: SEVERITY.MEDIUM as Severity,
    type: TASK_TYPE.PBI as TaskType,
    parentId: "",
    dueDate: "",
    assigneeId: "",
    tags: "",
    routineCadence: "NONE",
    dependencyIds: [] as string[],
  });
  const [addLoading, setAddLoading] = useState(false);
  const [approvalLoadingId, setApprovalLoadingId] = useState<string | null>(null);
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [prepTask, setPrepTask] = useState<TaskDTO | null>(null);
  const [prepType, setPrepType] = useState<AiPrepType>("CHECKLIST");
  const [prepOutputs, setPrepOutputs] = useState<AiPrepOutput[]>([]);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepFetchLoading, setPrepFetchLoading] = useState(false);
  const [prepActionLoadingId, setPrepActionLoadingId] = useState<string | null>(null);
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
  const resetFormToDefaults = () => setForm(createDefaultForm());
  const resetAiCreationState = () => {
    setCreationStep(1);
    setAiQuestions([]);
    setAiAnswers({});
    setEstimatedScore(null);
    setAiError(null);
    setScoreHint(null);
    setAiLoading(false);
    setDefinitionError(null);
  };
  const openAddModal = () => {
    resetFormToDefaults();
    resetAiCreationState();
    // 1人しかいない場合は自動的に担当者を設定
    if (members.length === 1) {
      setForm((prev) => ({ ...prev, assigneeId: members[0].id }));
    }
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    resetAiCreationState();
    resetFormToDefaults();
  };
  const handleAiAnswerChange = (index: number, value: string) => {
    setAiAnswers((prev) => ({ ...prev, [index]: value }));
  };

  const runAiSupport = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const scoreRes = await apiFetch("/api/ai/score", {
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
      const suggestionRes = await apiFetch("/api/ai/suggest", {
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

  const fetchMembers = useCallback(async () => {
    if (!ready || !workspaceId) {
      setMembers([]);
      return;
    }
    const res = await apiFetch(`/api/workspaces/${workspaceId}/members`);
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members ?? []);
  }, [ready, workspaceId]);

  // 1人しかいない場合は自動的に担当者を設定
  useEffect(() => {
    if (members.length === 1 && !form.assigneeId) {
      setForm((prev) => ({ ...prev, assigneeId: members[0].id }));
    }
  }, [members, form.assigneeId]);

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

  useEffect(() => {
    void Promise.all([fetchTasks(), fetchMembers()]);
  }, [fetchTasks, fetchMembers]);

  // Single pass to compute taskById, childCount, visibleItems, groupedByType, parentCandidates
  const { taskById, childCount, visibleItems, groupedByType, parentCandidates } = useMemo(() => {
    const taskById = new Map<string, TaskDTO>();
    const childCount = new Map<string, number>();
    const visibleItems: TaskDTO[] = [];
    const groupedByType: Record<TaskType, TaskDTO[]> = {
      [TASK_TYPE.EPIC]: [],
      [TASK_TYPE.PBI]: [],
      [TASK_TYPE.TASK]: [],
      [TASK_TYPE.ROUTINE]: [],
    };
    const parentCandidates: TaskDTO[] = [];

    const targetStatus = view === "product" ? TASK_STATUS.BACKLOG : TASK_STATUS.SPRINT;

    for (const item of items) {
      // taskById
      taskById.set(item.id, item);

      // childCount
      if (item.parentId) {
        childCount.set(item.parentId, (childCount.get(item.parentId) ?? 0) + 1);
      }

      // parentCandidates
      const type = (item.type ?? TASK_TYPE.PBI) as TaskType;
      if (type === TASK_TYPE.EPIC || type === TASK_TYPE.PBI) {
        parentCandidates.push(item);
      }

      // visibleItems + groupedByType
      if (
        item.status === targetStatus &&
        item.automationState !== AUTOMATION_STATE.DELEGATED &&
        item.automationState !== AUTOMATION_STATE.SPLIT_PARENT
      ) {
        visibleItems.push(item);
        groupedByType[type].push(item);
      }
    }

    return {
      taskById,
      childCount,
      visibleItems,
      groupedByType,
      parentCandidates,
    };
  }, [items, view]);

  const isBlocked = (item: TaskDTO) =>
    (item.dependencies ?? []).some((dep) => dep.status !== TASK_STATUS.DONE);

  const addItem = async () => {
    if (!form.title.trim()) return;
    const statusValue = view === "sprint" ? TASK_STATUS.SPRINT : TASK_STATUS.BACKLOG;
    const baseDescription = form.description.trim();
    const aiSupplement = buildAiSupplementText();
    const finalDescription = aiSupplement
      ? baseDescription
        ? `${baseDescription}\n\n${aiSupplement}`
        : aiSupplement
      : baseDescription;
    setAddLoading(true);
    try {
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: finalDescription,
          definitionOfDone: form.definitionOfDone.trim(),
          checklist: checklistFromText(form.checklistText),
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
          routineCadence: form.type === TASK_TYPE.ROUTINE ? form.routineCadence : "NONE",
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
        closeModal();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error?.message ?? "タスクの追加に失敗しました。");
      }
    } finally {
      setAddLoading(false);
    }
  };

  const moveToSprint = async (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: TASK_STATUS.SPRINT } : item)),
    );
    const res = await apiFetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: TASK_STATUS.SPRINT }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error?.message ?? "スプリントへの移動に失敗しました。");
      void fetchTasks();
      return;
    }
    void fetchTasks();
  };

  const moveToBacklog = async (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: TASK_STATUS.BACKLOG } : item)),
    );
    const res = await apiFetch(`/api/tasks/${id}`, {
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

  const toggleChecklistItem = async (taskId: string, checklistId: string) => {
    const target = items.find((item) => item.id === taskId);
    if (!target || !Array.isArray(target.checklist)) return;
    const nextChecklist = target.checklist.map((item) =>
      item.id === checklistId ? { ...item, done: !item.done } : item,
    );
    setItems((prev) =>
      prev.map((item) => (item.id === taskId ? { ...item, checklist: nextChecklist } : item)),
    );
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: nextChecklist }),
    });
  };

  const loadPrepOutputs = useCallback(async (taskId: string) => {
    setPrepFetchLoading(true);
    try {
      const res = await apiFetch(`/api/ai/prep?taskId=${taskId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPrepOutputs(data.outputs ?? []);
    } finally {
      setPrepFetchLoading(false);
    }
  }, []);

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
      const res = await apiFetch("/api/ai/prep", {
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
      const res = await apiFetch(`/api/ai/prep/${output.id}`, {
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
    await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
    await fetchTasks();
  };

  const openEdit = (item: TaskDTO) => {
    setEditItem(item);
    setEditForm({
      title: item.title,
      description: item.description ?? "",
      definitionOfDone: item.definitionOfDone ?? "",
      checklistText: checklistToText(item.checklist ?? null),
      points: item.points,
      urgency: item.urgency,
      risk: item.risk,
      type: item.type ?? TASK_TYPE.PBI,
      parentId: item.parentId ?? "",
      dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : "",
      assigneeId: item.assigneeId ?? "",
      tags: item.tags?.join(", ") ?? "",
      routineCadence: item.routineCadence ?? "NONE",
      dependencyIds: item.dependencyIds ?? [],
    });
  };

  const saveEdit = async () => {
    if (!editItem) return;
    await apiFetch(`/api/tasks/${editItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        definitionOfDone: editForm.definitionOfDone.trim(),
        checklist: checklistFromText(editForm.checklistText),
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
        routineCadence: editForm.type === TASK_TYPE.ROUTINE ? editForm.routineCadence : "NONE",
        dependencyIds: editForm.dependencyIds,
      }),
    });
    setEditItem(null);
    await fetchTasks();
  };

  const approveAutomation = async (id: string) => {
    setApprovalLoadingId(id);
    try {
      await apiFetch("/api/automation/approval", {
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
      await apiFetch("/api/automation/approval", {
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
      <header className="border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Backlog</p>
            <h1 className="text-3xl font-semibold text-[var(--text-primary)]">バックログ</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              手入力＋後でインポートを追加。点数と緊急度/リスクをセットしてスプリントに送れるように。
            </p>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div className="flex items-center gap-2 whitespace-nowrap border border-[var(--border)] bg-[var(--surface)] p-1 text-xs text-[var(--text-secondary)]">
              <button
                onClick={() => setView("product")}
                className={`px-3 py-1 transition ${
                  view === "product"
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--accent)]"
                }`}
              >
                目標リスト
              </button>
              <button
                onClick={() => setView("sprint")}
                className={`px-3 py-1 transition ${
                  view === "sprint"
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--accent)]"
                }`}
              >
                スプリントバックログ
              </button>
            </div>
            <Link
              href="/sprint"
              className="border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
            >
              スプリントへ
            </Link>
            <button
              onClick={() => {
                fetchTasks();
                openAddModal();
              }}
              className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[var(--accent)]/30"
            >
              タスクを追加
            </button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={filters.q}
              onChange={(e) => {
                updateFilter("q", e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void fetchTasks();
                }
              }}
              placeholder="タスクを検索..."
              className="w-full border border-[var(--border)] bg-[var(--background)] pl-10 pr-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`flex items-center gap-2 border px-3 py-2 text-sm transition ${
              hasActiveFilters()
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/60"
            }`}
          >
            <Filter className="h-4 w-4" />
            フィルタ
            {hasActiveFilters() && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-xs text-white">
                !
              </span>
            )}
          </button>
          <button
            onClick={() => fetchTasks()}
            className="border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
          >
            検索
          </button>
          {hasActiveFilters() && (
            <button
              onClick={() => {
                resetFilters();
                setTimeout(() => fetchTasks(), 0);
              }}
              className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              <X className="h-4 w-4" />
              リセット
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {isFilterOpen && (
          <div className="mt-4 border border-[var(--border)] bg-[var(--background)] p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                タイプ
                <select
                  multiple
                  value={filters.types}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map(
                      (o) => o.value as TaskType,
                    );
                    updateFilter("types", selected);
                  }}
                  className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                >
                  {taskTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                緊急度
                <select
                  value={filters.urgency ?? ""}
                  onChange={(e) => updateFilter("urgency", (e.target.value as Severity) || null)}
                  className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                >
                  <option value="">すべて</option>
                  {severityOptions.map((sev) => (
                    <option key={sev} value={sev}>
                      {SEVERITY_LABELS[sev]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                リスク
                <select
                  value={filters.risk ?? ""}
                  onChange={(e) => updateFilter("risk", (e.target.value as Severity) || null)}
                  className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                >
                  <option value="">すべて</option>
                  {severityOptions.map((sev) => (
                    <option key={sev} value={sev}>
                      {SEVERITY_LABELS[sev]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                担当者
                <select
                  value={filters.assigneeId ?? ""}
                  onChange={(e) => updateFilter("assigneeId", e.target.value || null)}
                  className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                >
                  <option value="">すべて</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.email ?? "メンバー"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                タグ (カンマ区切り)
                <input
                  type="text"
                  value={filters.tags.join(",")}
                  onChange={(e) =>
                    updateFilter(
                      "tags",
                      e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="ui,api"
                  className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                期限 (以前)
                <input
                  type="date"
                  value={filters.dueBefore ?? ""}
                  onChange={(e) => updateFilter("dueBefore", e.target.value || null)}
                  className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                />
              </label>
              <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                期限 (以降)
                <input
                  type="date"
                  value={filters.dueAfter ?? ""}
                  onChange={(e) => updateFilter("dueAfter", e.target.value || null)}
                  className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                />
              </label>
              <div className="grid gap-1 text-xs text-[var(--text-muted)]">
                ポイント範囲
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="34"
                    value={filters.minPoints ?? ""}
                    onChange={(e) =>
                      updateFilter("minPoints", e.target.value ? Number(e.target.value) : null)
                    }
                    placeholder="最小"
                    className="w-1/2 border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                  />
                  <input
                    type="number"
                    min="1"
                    max="34"
                    value={filters.maxPoints ?? ""}
                    onChange={(e) =>
                      updateFilter("maxPoints", e.target.value ? Number(e.target.value) : null)
                    }
                    placeholder="最大"
                    className="w-1/2 border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Operations Toolbar */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={toggleSelectionMode}
            className={`flex items-center gap-2 border px-3 py-2 text-sm transition ${
              isSelectionMode
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/60"
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            {isSelectionMode ? "選択モード終了" : "一括選択"}
          </button>

          {isSelectionMode && (
            <>
              <span className="text-sm text-[var(--text-muted)]">{selectedCount}件選択中</span>
              <button
                onClick={() => selectAll(visibleItems.map((i) => i.id))}
                className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                すべて選択
              </button>
              <button
                onClick={clearSelection}
                className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                選択解除
              </button>

              {selectedCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-l border-[var(--border)] pl-3">
                  <select
                    disabled={bulkLoading}
                    onChange={(e) => {
                      if (e.target.value) {
                        void bulkUpdateStatus(e.target.value as TaskStatus);
                        e.target.value = "";
                      }
                    }}
                    className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      ステータス変更
                    </option>
                    <option value="BACKLOG">バックログ</option>
                    <option value="SPRINT">スプリント</option>
                    <option value="DONE">完了</option>
                  </select>

                  <select
                    disabled={bulkLoading}
                    onChange={(e) => {
                      if (e.target.value) {
                        void bulkUpdatePoints(Number(e.target.value));
                        e.target.value = "";
                      }
                    }}
                    className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text-primary)]"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      ポイント変更
                    </option>
                    {storyPoints.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt} pt
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      if (window.confirm(`${selectedCount}件のタスクを削除しますか？`)) {
                        void bulkDelete();
                      }
                    }}
                    disabled={bulkLoading}
                    className="flex items-center gap-1 border border-rose-200 bg-rose-50 px-2 py-1 text-sm text-rose-700 hover:border-rose-300 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    削除
                  </button>

                  {bulkLoading && (
                    <span className="text-sm text-[var(--text-muted)]">処理中...</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </header>

      <FocusPanel />

      {items.filter(
        (item) =>
          item.status === TASK_STATUS.BACKLOG &&
          item.automationState === AUTOMATION_STATE.DELEGATED,
      ).length ? (
        <section className="border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI委任キュー</h2>
            <span className="text-xs text-[var(--text-muted)]">
              {
                items.filter(
                  (item) =>
                    item.status === TASK_STATUS.BACKLOG &&
                    item.automationState === AUTOMATION_STATE.DELEGATED,
                ).length
              }{" "}
              件
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {items
              .filter(
                (item) =>
                  item.status === TASK_STATUS.BACKLOG &&
                  item.automationState === AUTOMATION_STATE.DELEGATED,
              )
              .map((item) => (
                <div
                  key={item.id}
                  className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[var(--text-primary)] dark:border-amber-800 dark:bg-amber-950"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[var(--text-primary)]">{item.title}</p>
                    <span className="border border-amber-200 bg-[var(--surface)] px-2 py-1 text-xs text-amber-700 dark:border-amber-800 dark:text-amber-400">
                      AI委任候補
                    </span>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.description}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                      {item.points} pt
                    </span>
                    <span className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                      緊急度: {SEVERITY_LABELS[item.urgency as Severity] ?? item.urgency}
                    </span>
                    <span className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                      リスク: {SEVERITY_LABELS[item.risk as Severity] ?? item.risk}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {items.filter((item) => item.automationState === AUTOMATION_STATE.PENDING_SPLIT).length ? (
        <section className="border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">自動分解 承認待ち</h2>
            <span className="text-xs text-[var(--text-muted)]">
              {
                items.filter((item) => item.automationState === AUTOMATION_STATE.PENDING_SPLIT)
                  .length
              }{" "}
              件
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {items
              .filter((item) => item.automationState === AUTOMATION_STATE.PENDING_SPLIT)
              .map((item) => (
                <div
                  key={item.id}
                  className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[var(--text-primary)] dark:border-amber-800 dark:bg-amber-950"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[var(--text-primary)]">{item.title}</p>
                    <span className="border border-amber-200 bg-[var(--surface)] px-2 py-1 text-[11px] text-amber-700 dark:border-amber-800 dark:text-amber-400">
                      承認待ち
                    </span>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.description}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                      {item.points} pt
                    </span>
                    <span className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                      緊急度: {SEVERITY_LABELS[item.urgency as Severity] ?? item.urgency}
                    </span>
                    <span className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                      リスク: {SEVERITY_LABELS[item.risk as Severity] ?? item.risk}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <LoadingButton
                      onClick={() => approveAutomation(item.id)}
                      loading={approvalLoadingId === item.id}
                      className="border border-emerald-300 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 transition hover:border-emerald-400 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    >
                      BARABARA
                    </LoadingButton>
                    <button
                      onClick={() => rejectAutomation(item.id)}
                      disabled={approvalLoadingId === item.id}
                      className="border border-[var(--border)] bg-[var(--surface)] px-3 py-1 font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)]"
                    >
                      却下
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      <section className="border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="grid gap-5">
          {taskTypeOrder.map((type) => {
            const bucket = groupedByType[type];
            if (!bucket.length) return null;
            return (
              <div key={type} className="grid gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    {taskTypeLabels[type]}
                  </h2>
                  <span className="text-xs text-[var(--text-muted)]">{bucket.length} 件</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {bucket.map((item) => {
                    const aiConfig: AiSuggestionConfig = {
                      splitThreshold,
                      suggestLoadingId,
                      scoreLoadingId,
                      splitLoadingId,
                      suggestion: suggestionMap[item.id]
                        ? { text: suggestionMap[item.id].text }
                        : undefined,
                      score: scoreMap[item.id],
                      splits: splitMap[item.id],
                      proactiveSuggestion: proactiveSuggestionsMap.get(item.id),
                      onGetSuggestion: () => getSuggestion(item.title, item.description, item.id),
                      onEstimateScore: () => estimateScoreForTask(item),
                      onRequestSplit: () => requestSplit(item),
                      onApplySplit: () => applySplit(item, view),
                      onApplyTipSuggestion: () => applyTipSuggestion(item.id),
                      onApplyScoreSuggestion: () => applyScoreSuggestion(item.id),
                      onDismissTip: () => dismissTip(item.id),
                      onDismissScore: () => dismissScore(item.id),
                      onDismissSplit: () => rejectSplit(item.id),
                      onOpenPrepModal: () => openPrepModal(item),
                    };
                    return (
                      <div key={item.id} className="relative">
                        {isSelectionMode && (
                          <label className="absolute left-2 top-2 z-10 flex items-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelection(item.id)}
                              className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
                            />
                          </label>
                        )}
                        <TaskCard
                          item={item}
                          variant="backlog"
                          parentTask={item.parentId ? taskById.get(item.parentId) : undefined}
                          childCount={childCount.get(item.id) ?? 0}
                          members={members.map((m) => ({
                            id: m.id,
                            name: m.name,
                          }))}
                          isBlocked={isBlocked(item)}
                          aiConfig={aiConfig}
                          onMoveToSprint={
                            view === "product" ? () => moveToSprint(item.id) : undefined
                          }
                          onMoveToBacklog={
                            view === "sprint" ? () => moveToBacklog(item.id) : undefined
                          }
                          onDelete={() => deleteItem(item.id)}
                          onEdit={() => openEdit(item)}
                          onToggleChecklistItem={(checklistId) =>
                            toggleChecklistItem(item.id, checklistId)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {items.filter((item) => item.automationState === AUTOMATION_STATE.SPLIT_PARENT).length ? (
        <section className="border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              自動分解済み (元タスク)
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              {
                items.filter((item) => item.automationState === AUTOMATION_STATE.SPLIT_PARENT)
                  .length
              }{" "}
              件
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {items
              .filter((item) => item.automationState === AUTOMATION_STATE.SPLIT_PARENT)
              .map((item) => (
                <div
                  key={item.id}
                  className="border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm text-[var(--text-primary)]"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-[var(--text-primary)]">{item.title}</p>
                    <span className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                      分解済み
                    </span>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.description}</p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
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
                onClick={closeModal}
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
                    onClick={closeModal}
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
                    <p className="inline-flex items-center gap-1 font-semibold text-slate-900">
                      AIがポイント・緊急度・リスクを先行推定済みです。
                      <HelpTooltip text="AIがタスクの内容から自動でスコアを推定します。手動で変更もできます。" />
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
                {definitionError ? (
                  <p className="text-xs text-rose-600">{definitionError}</p>
                ) : null}
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
                    <p className="font-semibold text-slate-900">
                      AI予測を踏まえて詳細を整えています。
                    </p>
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
                    <span className="inline-flex items-center gap-1">
                      ポイント
                      <HelpTooltip text="ストーリーポイントはタスクの相対的な大きさを表します。1が最小、13以上は分解を検討してください。" />
                    </span>
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
                        <span className="inline-flex items-center gap-1">
                          緊急度
                          <HelpTooltip text="緊急度はいつまでにやるか、リスクは不確実性の高さを表します。" />
                        </span>
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
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          type: e.target.value as TaskType,
                        }))
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
                {form.type === TASK_TYPE.ROUTINE ? (
                  <label className="grid gap-1 text-xs text-slate-500">
                    ルーティン周期
                    <select
                      value={form.routineCadence}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          routineCadence: e.target.value,
                        }))
                      }
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
                    onClick={addItem}
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
              <input
                value={editForm.definitionOfDone}
                onChange={(e) =>
                  setEditForm((p) => ({
                    ...p,
                    definitionOfDone: e.target.value,
                  }))
                }
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
                <select
                  value={editForm.points}
                  onChange={(e) =>
                    setEditForm((p) => ({
                      ...p,
                      points: Number(e.target.value) || 1,
                    }))
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
                  onChange={(e) =>
                    setEditForm((p) => ({
                      ...p,
                      urgency: e.target.value as Severity,
                    }))
                  }
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                >
                  {severityOptions.map((v) => (
                    <option key={v} value={v}>
                      {SEVERITY_LABELS[v]}
                    </option>
                  ))}
                </select>
                <select
                  value={editForm.risk}
                  onChange={(e) =>
                    setEditForm((p) => ({
                      ...p,
                      risk: e.target.value as Severity,
                    }))
                  }
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
                    value={editForm.type}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        type: e.target.value as TaskType,
                      }))
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
              {editForm.type === TASK_TYPE.ROUTINE ? (
                <label className="grid gap-1 text-xs text-slate-500">
                  ルーティン周期
                  <select
                    value={editForm.routineCadence}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        routineCadence: e.target.value,
                      }))
                    }
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
                        {member.name ?? member.email ?? "メンバー"}
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
