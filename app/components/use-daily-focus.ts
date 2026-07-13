"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { fetchAllTasks } from "@/lib/task-client";
import { type DailyFocusResult, getFocusSummary, selectDailyFocus } from "../../lib/daily-focus";
import { TASK_STATUS, type TaskDTO } from "../../lib/types";
import { useWorkspaceId } from "./use-workspace-id";

export type UseDailyFocusOptions = {
  maxTasks?: number;
  maxPoints?: number;
  includeBacklog?: boolean;
};

export function useDailyFocus(options: UseDailyFocusOptions = {}) {
  const { maxTasks = 3, maxPoints = 8, includeBacklog = false } = options;
  const { workspaceId, ready } = useWorkspaceId();

  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!ready || !workspaceId) {
      setTasks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append("status", TASK_STATUS.SPRINT);
      if (includeBacklog) params.append("status", TASK_STATUS.BACKLOG);
      for (const workflowState of ["READY", "IN_PROGRESS", "BLOCKED"]) {
        params.append("workflowState", workflowState);
      }
      setTasks(await fetchAllTasks(params));
    } catch {
      setError("今やることを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, [ready, workspaceId, includeBacklog]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const result: DailyFocusResult = useMemo(() => {
    return selectDailyFocus(tasks, { maxTasks, maxPoints, includeBacklog });
  }, [tasks, maxTasks, maxPoints, includeBacklog]);

  const summary = useMemo(() => getFocusSummary(result), [result]);

  const refresh = useCallback(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const markDone = useCallback(
    async (taskId: string) => {
      try {
        const res = await apiFetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: TASK_STATUS.DONE }),
        });
        if (res.ok) {
          void fetchTasks();
        } else {
          setError("タスクを完了にできませんでした。");
        }
      } catch {
        setError("タスクを完了にできませんでした。");
      }
    },
    [fetchTasks],
  );

  return {
    // State
    focusTasks: result.focusTasks,
    skippedTasks: result.skippedTasks,
    totalPoints: result.totalPoints,
    summary,
    loading,
    error,
    // Actions
    refresh,
    markDone,
  };
}
