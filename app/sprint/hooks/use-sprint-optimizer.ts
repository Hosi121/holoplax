import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { fetchAllTasks } from "@/lib/task-client";
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
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
};

export function useSprintOptimizer({
  ready,
  workspaceId,
  capacity,
  onTasksAdded,
  onError,
  onSuccess,
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
      setBacklogTasks(await fetchAllTasks("status=BACKLOG&workflowState=READY"));
    } catch {
      onError?.("やること候補を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, [ready, workspaceId, onError]);

  const runOptimization = useCallback(async () => {
    if (!ready || !workspaceId) return;

    setLoading(true);
    try {
      // 最新の候補タスクを取得
      const tasks: TaskDTO[] = await fetchAllTasks("status=BACKLOG&workflowState=READY");
      setBacklogTasks(tasks);

      // 最適化を実行
      const result = optimizeSprint(tasks, capacity);
      setOptimizationResult(result);
      setShowPanel(true);
    } catch {
      onError?.("おすすめを計算できませんでした。");
    } finally {
      setLoading(false);
    }
  }, [ready, workspaceId, capacity, onError]);

  const addSelectedTasks = useCallback(async () => {
    if (!optimizationResult || optimizationResult.selectedTasks.length === 0) return;

    setAdding(true);
    try {
      const res = await apiFetch("/api/tasks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          taskIds: optimizationResult.selectedTasks.map((task) => task.id),
          status: "SPRINT",
        }),
      });
      if (!res.ok) {
        onError?.("選んだタスクをスプリントへ追加できませんでした。");
        return;
      }
      setOptimizationResult(null);
      setShowPanel(false);
      onTasksAdded?.();
      onSuccess?.("おすすめのタスクをスプリントへ追加しました。");
    } finally {
      setAdding(false);
    }
  }, [optimizationResult, onTasksAdded, onError, onSuccess]);

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
