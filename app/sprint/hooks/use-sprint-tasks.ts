import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { fetchAllTasks } from "@/lib/task-client";
import {
  SEVERITY,
  type Severity,
  TASK_STATUS,
  TASK_TYPE,
  TASK_WORKFLOW_STATE,
  type TaskDTO,
  type TaskWorkflowState,
} from "../../../lib/types";

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

export type NewTaskForm = {
  title: string;
  description: string;
  definitionOfDone: string;
  checklistText: string;
  points: number;
  dueDate: string;
  assigneeId: string;
  tags: string;
};

export type EditTaskForm = {
  title: string;
  description: string;
  definitionOfDone: string;
  checklistText: string;
  points: number;
  urgency: Severity;
  risk: Severity;
  dueDate: string;
  assigneeId: string;
  tags: string;
};

export type UseSprintTasksOptions = {
  ready: boolean;
  workspaceId: string | null;
  sprintId?: string | null;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
  onCommitmentChange?: () => void;
};

const defaultNewForm: NewTaskForm = {
  title: "",
  description: "",
  definitionOfDone: "",
  checklistText: "",
  points: 1,
  dueDate: "",
  assigneeId: "",
  tags: "",
};

export function useSprintTasks({
  ready,
  workspaceId,
  sprintId,
  onWarning,
  onError,
  onSuccess,
  onCommitmentChange,
}: UseSprintTasksOptions) {
  const [items, setItems] = useState<TaskDTO[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<NewTaskForm>(defaultNewForm);
  const [editItem, setEditItem] = useState<TaskDTO | null>(null);
  const [editForm, setEditForm] = useState<EditTaskForm>({
    title: "",
    description: "",
    definitionOfDone: "",
    checklistText: "",
    points: 1,
    urgency: SEVERITY.MEDIUM,
    risk: SEVERITY.MEDIUM,
    dueDate: "",
    assigneeId: "",
    tags: "",
  });

  const fetchTasks = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setItems([]);
      setTasksLoading(false);
      return;
    }
    setTasksLoading(true);
    setTasksError(null);
    try {
      const params = new URLSearchParams();
      if (sprintId) {
        params.set("sprintId", sprintId);
      } else {
        params.append("status", "SPRINT");
      }
      for (const workflowState of ["READY", "IN_PROGRESS", "BLOCKED", "DONE"]) {
        params.append("workflowState", workflowState);
      }
      setItems(await fetchAllTasks(params));
    } catch {
      setTasksError("スプリントのタスクを読み込めませんでした。");
    } finally {
      setTasksLoading(false);
    }
  }, [ready, workspaceId, sprintId]);

  const displayedItems = items;

  const used = useMemo(
    () =>
      displayedItems
        .filter((item) => item.status !== TASK_STATUS.DONE)
        .reduce((sum, i) => sum + i.points, 0),
    [displayedItems],
  );

  const isBlocked = useCallback(
    (item: TaskDTO) => (item.dependencies ?? []).some((dep) => dep.workflowState !== "DONE"),
    [],
  );

  const addItem = async (remaining: number) => {
    if (!newItem.title.trim() || newItem.points <= 0) return;
    if (newItem.points > remaining) return;
    const res = await apiFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newItem.title.trim(),
        description: newItem.description.trim(),
        definitionOfDone: newItem.definitionOfDone.trim(),
        checklist: checklistFromText(newItem.checklistText),
        points: Number(newItem.points),
        urgency: SEVERITY.MEDIUM,
        risk: SEVERITY.MEDIUM,
        status: TASK_STATUS.SPRINT,
        type: TASK_TYPE.TASK,
        dueDate: newItem.dueDate || null,
        assigneeId: newItem.assigneeId || null,
        tags: newItem.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    });
    if (!res.ok) {
      onError?.("タスクを追加できませんでした。");
      return;
    }
    setNewItem(defaultNewForm);
    onSuccess?.("スプリントにタスクを追加しました。");
    onCommitmentChange?.();
    void fetchTasks();
  };

  const changeWorkflowState = async (id: string, workflowState: TaskWorkflowState) => {
    const target = items.find((item) => item.id === id);
    if (workflowState === TASK_WORKFLOW_STATE.DONE && target && isBlocked(target)) {
      onWarning?.("依存タスクが未完了のため完了にできません。");
      return;
    }
    if (
      workflowState === TASK_WORKFLOW_STATE.DONE &&
      target?.checklist?.some((item) => !item.done)
    ) {
      onWarning?.("チェックリストが未完了です。完了にする前に確認してください。");
      return;
    }
    const res = await apiFetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowState }),
    });
    if (!res.ok) {
      onError?.("進み具合を変更できませんでした。");
      return;
    }
    if (workflowState === TASK_WORKFLOW_STATE.CANCELED) onCommitmentChange?.();
    void fetchTasks();
  };

  const markDone = (id: string) => changeWorkflowState(id, TASK_WORKFLOW_STATE.DONE);

  const deleteItem = async (id: string) => {
    const res = await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      onError?.("タスクを削除できませんでした。");
      return;
    }
    onSuccess?.("タスクを削除しました。");
    onCommitmentChange?.();
    void fetchTasks();
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
      dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : "",
      assigneeId: item.assigneeId ?? "",
      tags: item.tags?.join(", ") ?? "",
    });
  };

  const closeEdit = () => setEditItem(null);

  const saveEdit = async () => {
    if (!editItem) return;
    const res = await apiFetch(`/api/tasks/${editItem.id}`, {
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
        dueDate: editForm.dueDate || null,
        assigneeId: editForm.assigneeId || null,
        tags: editForm.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    });
    if (!res.ok) {
      onError?.("変更を保存できませんでした。");
      return;
    }
    setEditItem(null);
    onSuccess?.("変更を保存しました。");
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
    const res = await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: nextChecklist }),
    });
    // Re-sync from the server on failure so the optimistic toggle doesn't stick.
    if (!res.ok) {
      onError?.("チェックリストを更新できませんでした。");
      void fetchTasks();
    }
  };

  return {
    // State
    items,
    tasksLoading,
    tasksError,
    displayedItems,
    used,
    newItem,
    setNewItem,
    editItem,
    editForm,
    setEditForm,
    // Actions
    fetchTasks,
    addItem,
    markDone,
    changeWorkflowState,
    deleteItem,
    openEdit,
    closeEdit,
    saveEdit,
    toggleChecklistItem,
    isBlocked,
  };
}
