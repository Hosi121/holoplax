import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  TASK_STATUS,
  TASK_TYPE,
  type TaskDTO,
  type TaskStatus,
  type TaskType,
} from "../../../lib/types";

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

export type UseTaskListOptions = {
  workspaceId: string | null;
  ready: boolean;
};

export function useTaskList({ workspaceId, ready }: UseTaskListOptions) {
  const [items, setItems] = useState<TaskDTO[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);

  const fetchTasksByStatus = useCallback(async (statuses: TaskStatus[]) => {
    const params = statuses.map((status) => `status=${encodeURIComponent(status)}`).join("&");
    const res = await apiFetch(`/api/tasks?${params}&limit=200`);
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
    const [backlogTasks, sprintTasks] = await Promise.all([
      fetchTasksByStatus([TASK_STATUS.BACKLOG]),
      fetchTasksByStatus([TASK_STATUS.SPRINT]),
    ]);
    const mergedMap = new Map<string, TaskDTO>();
    [...backlogTasks, ...sprintTasks].forEach((task) => {
      mergedMap.set(task.id, task);
    });
    setItems(Array.from(mergedMap.values()));
  }, [ready, workspaceId, fetchTasksByStatus]);

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

  const parentCandidates = useMemo(
    () =>
      items.filter((item) => {
        const type = (item.type ?? TASK_TYPE.PBI) as TaskType;
        return type === TASK_TYPE.EPIC || type === TASK_TYPE.PBI;
      }),
    [items],
  );

  const isBlocked = useCallback(
    (item: TaskDTO) => (item.dependencies ?? []).some((dep) => dep.status !== TASK_STATUS.DONE),
    [],
  );

  // Task operations
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

  const deleteItem = async (id: string) => {
    if (!window.confirm("このタスクを削除しますか？")) return;
    await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
    await fetchTasks();
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

  const approveAutomation = async (id: string) => {
    await apiFetch("/api/automation/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: id, action: "approve" }),
    });
    void fetchTasks();
  };

  const rejectAutomation = async (id: string) => {
    await apiFetch("/api/automation/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: id, action: "reject" }),
    });
    void fetchTasks();
  };

  return {
    items,
    setItems,
    members,
    taskById,
    childCount,
    parentCandidates,
    isBlocked,
    fetchTasks,
    fetchMembers,
    moveToSprint,
    moveToBacklog,
    deleteItem,
    toggleChecklistItem,
    approveAutomation,
    rejectAutomation,
  };
}
