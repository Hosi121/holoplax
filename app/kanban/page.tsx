"use client";

import { CheckCircle2, Inbox, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { AUTOMATION_STATE, TASK_STATUS, type TaskDTO, type TaskStatus } from "../../lib/types";
import { NAV_LABELS, TASK_STATUS_LABELS } from "../../lib/ui-language";
import { DropdownMenu } from "../components/dropdown-menu";
import { EmptyState } from "../components/empty-state";
import { TaskCard } from "../components/task-card";
import { useToast } from "../components/toast";
import { InlineError, PageSkeleton } from "../components/ui/feedback";
import { useWorkspaceId } from "../components/use-workspace-id";

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

type SprintInfo = {
  id: string;
  name: string;
  status: string;
} | null;

type Column = {
  key: TaskStatus;
  label: string;
  hint: string;
};

const columns: Column[] = [
  { key: TASK_STATUS.BACKLOG, label: "やること", hint: "これから取り組む候補" },
  { key: TASK_STATUS.SPRINT, label: "スプリント", hint: "今週やる" },
  { key: TASK_STATUS.DONE, label: "完了", hint: "完了したもの" },
];

export default function KanbanPage() {
  const { workspaceId, ready } = useWorkspaceId();
  const toast = useToast();
  const [items, setItems] = useState<TaskDTO[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [sprint, setSprint] = useState<SprintInfo>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<TaskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isBlocked = useCallback(
    (item: TaskDTO) => (item.dependencies ?? []).some((dep) => dep.status !== TASK_STATUS.DONE),
    [],
  );
  const isAiTask = useCallback(
    (item: TaskDTO) =>
      item.automationState !== undefined && item.automationState !== AUTOMATION_STATE.NONE,
    [],
  );

  const fetchTasks = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/tasks?status=BACKLOG&status=SPRINT&status=DONE&limit=400");
      if (!res.ok) {
        setError("進捗を読み込めませんでした。");
        return;
      }
      const data = await res.json();
      setItems(data.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, [ready, workspaceId]);

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

  const fetchSprint = useCallback(async () => {
    if (!ready || !workspaceId) {
      setSprint(null);
      return;
    }
    const res = await apiFetch(`/api/sprints?status=ACTIVE`);
    if (!res.ok) {
      setSprint(null);
      return;
    }
    const data = await res.json();
    const activeSprint = data.sprints?.[0] ?? null;
    setSprint(activeSprint);
  }, [ready, workspaceId]);

  useEffect(() => {
    void fetchTasks();
    void fetchMembers();
    void fetchSprint();
  }, [fetchTasks, fetchMembers, fetchSprint]);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, TaskDTO[]> = {
      BACKLOG: [],
      SPRINT: [],
      DONE: [],
    };
    items.forEach((item) => {
      map[item.status]?.push(item);
    });
    return map;
  }, [items]);

  const moveTask = async (taskId: string, status: TaskStatus) => {
    const target = items.find((item) => item.id === taskId);
    if (target && (status === TASK_STATUS.SPRINT || status === TASK_STATUS.DONE)) {
      if (isBlocked(target)) {
        toast.warning("依存タスクが未完了のため移動できません。");
        setDraggingId(null);
        setHoverColumn(null);
        return;
      }
      if (status === TASK_STATUS.DONE && target.checklist?.some((item) => !item.done)) {
        toast.warning("チェックリストが未完了のため完了にできません。");
        setDraggingId(null);
        setHoverColumn(null);
        return;
      }
    }
    setHoverColumn(null);
    const originalItems = [...items];
    setItems((prev) => prev.map((item) => (item.id === taskId ? { ...item, status } : item)));
    setDraggingId(null);
    const res = await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setItems(originalItems);
      const errorData = await res.json().catch(() => ({}));
      const message = errorData?.error?.message ?? errorData?.message ?? "移動に失敗しました。";
      if (message.includes("active sprint not found")) {
        toast.error("アクティブなスプリントがありません。スプリントを開始してください。");
      } else if (message.includes("sprint capacity exceeded")) {
        toast.error("スプリントの容量を超えています。");
      } else if (message.includes("dependencies must be done")) {
        toast.warning("依存タスクが未完了のため移動できません。");
      } else {
        toast.error(message);
      }
      return;
    }
    await fetchTasks();
    await fetchSprint();
  };

  const handleDrop = async (status: TaskStatus) => {
    if (draggingId) await moveTask(draggingId, status);
  };

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs text-slate-500">{NAV_LABELS.sprint}</p>
          <h1 className="text-3xl font-semibold text-slate-900">進捗ボード</h1>
          <p className="text-sm text-slate-600">
            ドラッグまたはカードのメニューから進み具合を変更できます。
          </p>
          <a href="/sprint" className="mt-3 inline-flex text-sm text-[#2323eb] underline">
            スプリントの計画へ戻る
          </a>
        </div>
      </header>

      {error ? <InlineError message={error} onRetry={() => void fetchTasks()} /> : null}
      {loading && !items.length ? <PageSkeleton /> : null}

      <section className="min-w-0 grid gap-4 lg:grid-cols-3">
        {columns.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverColumn(col.key);
            }}
            onDragLeave={() => setHoverColumn(null)}
            onDrop={() => handleDrop(col.key)}
            className={`flex h-[70vh] min-w-0 flex-col border border-slate-200 bg-white p-4 shadow-sm ${
              hoverColumn === col.key ? "ring-2 ring-[#2323eb]/40" : ""
            }`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {col.key === TASK_STATUS.SPRINT && sprint
                    ? `スプリント: ${sprint.name}`
                    : col.label}
                </h2>
                <p className="text-xs text-slate-500">
                  {col.key === TASK_STATUS.SPRINT && !sprint
                    ? "アクティブなスプリントがありません"
                    : col.hint}
                </p>
              </div>
              <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                {grouped[col.key].length}
              </span>
            </div>

            <div className="mt-3 grid flex-1 content-start gap-3 overflow-y-auto">
              {grouped[col.key].length > 0 ? (
                grouped[col.key].map((item) => (
                  <TaskCard
                    key={item.id}
                    item={item}
                    variant="kanban"
                    members={members.map((m) => ({ id: m.id, name: m.name }))}
                    isBlocked={isBlocked(item)}
                    showAiTaskBadge
                    isAiTask={isAiTask(item)}
                    showChecklist={false}
                    showMetadata={false}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(item.id);
                      e.dataTransfer.setData("text/plain", item.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    isDragging={draggingId === item.id}
                    className="min-w-0 break-words transition"
                    renderActions={() => (
                      <DropdownMenu
                        label="進み具合を変更"
                        items={columns
                          .filter((target) => target.key !== item.status)
                          .map((target) => ({
                            label: `${TASK_STATUS_LABELS[target.key]}へ移動`,
                            onClick: () => void moveTask(item.id, target.key),
                          }))}
                      />
                    )}
                  />
                ))
              ) : (
                <EmptyState
                  icon={
                    col.key === TASK_STATUS.BACKLOG
                      ? Inbox
                      : col.key === TASK_STATUS.SPRINT
                        ? Zap
                        : CheckCircle2
                  }
                  title={
                    col.key === TASK_STATUS.BACKLOG
                      ? "やることは空です"
                      : col.key === TASK_STATUS.SPRINT
                        ? "スプリントにタスクがありません"
                        : "完了タスクはまだありません"
                  }
                  description={
                    col.key === TASK_STATUS.BACKLOG
                      ? "やること画面からタスクを追加しましょう。"
                      : col.key === TASK_STATUS.SPRINT
                        ? "やることから今回進めるタスクを選びましょう。"
                        : "タスクをここにドラッグすると完了になります。"
                  }
                  actionLabel={
                    col.key === TASK_STATUS.BACKLOG
                      ? "やることを見る"
                      : col.key === TASK_STATUS.SPRINT
                        ? sprint
                          ? "やることを選ぶ"
                          : "スプリントを開始"
                        : "スプリントを確認"
                  }
                  actionHref={
                    col.key === TASK_STATUS.BACKLOG || (col.key === TASK_STATUS.SPRINT && sprint)
                      ? "/backlog"
                      : "/sprint"
                  }
                />
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
