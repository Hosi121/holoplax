import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { SEVERITY, type Severity, TASK_STATUS, TASK_TYPE, type TaskDTO } from "../../../lib/types";

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

export function useSprintTasks({ ready, workspaceId, sprintId, onWarning }: UseSprintTasksOptions) {
  const [items, setItems] = useState<TaskDTO[]>([]);
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
      return;
    }
    const res = await apiFetch("/api/tasks?status=SPRINT&limit=200");
    const data = await res.json();
    setItems(data.tasks ?? []);
  }, [ready, workspaceId]);

  const displayedItems = useMemo(() => {
    if (sprintId) {
      return items.filter((item) => item.sprintId === sprintId);
    }
    return items.filter(
      (item) => item.status === TASK_STATUS.SPRINT || item.status === TASK_STATUS.DONE,
    );
  }, [items, sprintId]);

  const used = useMemo(
    () =>
      displayedItems
        .filter((item) => item.status !== TASK_STATUS.DONE)
        .reduce((sum, i) => sum + i.points, 0),
    [displayedItems],
  );

  const isBlocked = useCallback(
    (item: TaskDTO) => (item.dependencies ?? []).some((dep) => dep.status !== TASK_STATUS.DONE),
    [],
  );

  const addItem = async (remaining: number) => {
    if (!newItem.title.trim() || newItem.points <= 0) return;
    if (newItem.points > remaining) return;
    await apiFetch("/api/tasks", {
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
    setNewItem(defaultNewForm);
    fetchTasks();
  };

  const markDone = async (id: string) => {
    const target = items.find((item) => item.id === id);
    if (target && isBlocked(target)) {
      onWarning?.("依存タスクが未完了のため完了にできません。");
      return;
    }
    if (target?.checklist?.some((item) => !item.done)) {
      onWarning?.("チェックリストが未完了です。完了にする前に確認してください。");
      return;
    }
    await apiFetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: TASK_STATUS.DONE }),
    });
    fetchTasks();
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm("このタスクを削除しますか？")) return;
    await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
    fetchTasks();
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
        dueDate: editForm.dueDate || null,
        assigneeId: editForm.assigneeId || null,
        tags: editForm.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    });
    setEditItem(null);
    fetchTasks();
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

  return {
    // State
    items,
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
    deleteItem,
    openEdit,
    closeEdit,
    saveEdit,
    toggleChecklistItem,
    isBlocked,
  };
}
