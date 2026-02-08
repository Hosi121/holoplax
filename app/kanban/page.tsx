"use client";

import { CheckCircle2, Inbox, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AUTOMATION_STATE, TASK_STATUS, type TaskDTO, type TaskStatus } from "../../lib/types";
import { EmptyState } from "../components/empty-state";
import { TaskCard } from "../components/task-card";
import { useToast } from "../components/toast";
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
  { key: TASK_STATUS.BACKLOG, label: "バックログ", hint: "あとでやる" },
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
      return;
    }
    const res = await fetch("/api/tasks?status=BACKLOG&status=SPRINT&status=DONE&limit=400");
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

  const fetchSprint = useCallback(async () => {
    if (!ready || !workspaceId) {
      setSprint(null);
      return;
    }
    const res = await fetch(`/api/sprints?status=ACTIVE`);
    if (!res.ok) {
      setSprint(null);
      return;
    }
    const data = await res.json();
    const activeSprint = data.sprints?.[0] ?? null;
    setSprint(activeSprint);
  }, [ready, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleDrop = async (status: TaskStatus) => {
    if (!draggingId) return;
    const target = items.find((item) => item.id === draggingId);
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
    setItems((prev) => prev.map((item) => (item.id === draggingId ? { ...item, status } : item)));
    setDraggingId(null);
    const res = await fetch(`/api/tasks/${draggingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setItems(originalItems);
      const errorData = await res.json().catch(() => ({}));
      const message = JSON.stringify(
        errorData.message || errorData.error || "移動に失敗しました。",
      );
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

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Kanban</p>
          <h1 className="text-3xl font-semibold text-slate-900">カンバン</h1>
          <p className="text-sm text-slate-600">
            ドラッグでステータスを移動（BACKLOG / SPRINT / DONE）。
          </p>
        </div>
      </header>

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
                      ? "バックログは空です"
                      : col.key === TASK_STATUS.SPRINT
                        ? "スプリントにタスクがありません"
                        : "完了タスクはまだありません"
                  }
                  description={
                    col.key === TASK_STATUS.BACKLOG
                      ? "バックログページからタスクを追加しましょう。"
                      : col.key === TASK_STATUS.SPRINT
                        ? "バックログからドラッグしてタスクをコミットしましょう。"
                        : "タスクをここにドラッグすると完了になります。"
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
