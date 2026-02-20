import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  calculateTaskScore,
  getOptimizationSummary,
  type OptimizationResult,
  optimizeSprint,
} from "../../../lib/sprint-optimizer";
import type { TaskDTO } from "../../../lib/types";

export type UseSprintOptimizerOptions = {
  ready: boolean;
  workspaceId: string | null;
  capacity: number;
  onTasksAdded?: () => void;
};

export function useSprintOptimizer({
  ready,
  workspaceId,
  capacity,
  onTasksAdded,
}: UseSprintOptimizerOptions) {
  const [backlogTasks, setBacklogTasks] = useState<TaskDTO[]>([]);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const fetchBacklogTasks = useCallback(async () => {
    if (!ready || !workspaceId) {
      setBacklogTasks([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/tasks?status=BACKLOG&limit=200");
      if (!res.ok) return;
      const data = await res.json();
      setBacklogTasks(data.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, [ready, workspaceId]);

  const runOptimization = useCallback(async () => {
    if (!ready || !workspaceId) return;

    setLoading(true);
    try {
      // 最新のバックログを取得
      const res = await apiFetch("/api/tasks?status=BACKLOG&limit=200");
      if (!res.ok) return;
      const data = await res.json();
      const tasks: TaskDTO[] = data.tasks ?? [];
      setBacklogTasks(tasks);

      // 最適化を実行
      const result = optimizeSprint(tasks, capacity);
      setOptimizationResult(result);
      setShowPanel(true);
    } finally {
      setLoading(false);
    }
  }, [ready, workspaceId, capacity]);

  const addSelectedTasks = useCallback(async () => {
    if (!optimizationResult || optimizationResult.selectedTasks.length === 0) return;

    setAdding(true);
    try {
      // 選択されたタスクを順番にスプリントに追加
      for (const task of optimizationResult.selectedTasks) {
        await apiFetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "SPRINT" }),
        });
      }
      setOptimizationResult(null);
      setShowPanel(false);
      onTasksAdded?.();
    } finally {
      setAdding(false);
    }
  }, [optimizationResult, onTasksAdded]);

  const closePanel = useCallback(() => {
    setShowPanel(false);
    setOptimizationResult(null);
  }, []);

  const summary = optimizationResult ? getOptimizationSummary(optimizationResult, capacity) : null;

  return {
    backlogTasks,
    optimizationResult,
    loading,
    adding,
    showPanel,
    summary,
    fetchBacklogTasks,
    runOptimization,
    addSelectedTasks,
    closePanel,
    calculateTaskScore,
  };
}
