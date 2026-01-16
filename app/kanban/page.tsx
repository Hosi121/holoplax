"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/sidebar";
import { useWorkspaceId } from "../components/use-workspace-id";
import { TASK_STATUS, TaskDTO, TaskStatus } from "../../lib/types";

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

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
  const [items, setItems] = useState<TaskDTO[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<TaskStatus | null>(null);

  const isBlocked = useCallback(
    (item: TaskDTO) =>
      (item.dependencies ?? []).some((dep) => dep.status !== TASK_STATUS.DONE),
    [],
  );

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTasks();
    void fetchMembers();
  }, [fetchTasks, fetchMembers]);

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
        window.alert("依存タスクが未完了のため移動できません。");
        setDraggingId(null);
        setHoverColumn(null);
        return;
      }
    }
    setHoverColumn(null);
    setItems((prev) =>
      prev.map((item) => (item.id === draggingId ? { ...item, status } : item)),
    );
    setDraggingId(null);
    await fetch(`/api/tasks/${draggingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchTasks();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-10 lg:px-6 lg:py-14">
      <Sidebar />
      <main className="flex-1 space-y-6">
        <header className="border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Kanban</p>
            <h1 className="text-3xl font-semibold text-slate-900">カンバン</h1>
            <p className="text-sm text-slate-600">
              ドラッグでステータスを移動（BACKLOG / SPRINT / DONE）。
            </p>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          {columns.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverColumn(col.key);
              }}
              onDragLeave={() => setHoverColumn(null)}
              onDrop={() => handleDrop(col.key)}
              className={`min-h-[60vh] border border-slate-200 bg-white p-4 shadow-sm ${
                hoverColumn === col.key ? "ring-2 ring-[#2323eb]/40" : ""
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{col.label}</h2>
                  <p className="text-xs text-slate-500">{col.hint}</p>
                </div>
                <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                  {grouped[col.key].length}
                </span>
              </div>

              <div className="mt-3 grid gap-3">
                {grouped[col.key].map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(item.id);
                      e.dataTransfer.setData("text/plain", item.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 transition ${
                      draggingId === item.id ? "opacity-60" : ""
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    {item.description ? (
                      <p className="mt-1 text-xs text-slate-600">{item.description}</p>
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
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        {item.points} pt
                      </span>
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        緊急度: {item.urgency}
                      </span>
                      <span className="border border-slate-200 bg-white px-2 py-1">
                        リスク: {item.risk}
                      </span>
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
