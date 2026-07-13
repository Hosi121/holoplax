import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { TaskDTO } from "../../../lib/types";

export type AiPrepType = "EMAIL" | "IMPLEMENTATION" | "CHECKLIST";

export type AiPrepOutput = {
  id: string;
  type: AiPrepType;
  status: "PENDING" | "APPROVED" | "APPLIED" | "REJECTED";
  output: string;
  createdAt: string;
};

/**
 * State and actions for the per-task "AI下準備" (prep) modal: listing existing
 * prep outputs, generating a new one, and approving/applying/reverting them.
 * `fetchTasks` is invoked after apply/revert so the board reflects the change.
 */
type UseTaskPrepOptions = {
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
};

export function useTaskPrep(
  fetchTasks: () => void | Promise<void>,
  { onError, onSuccess }: UseTaskPrepOptions = {},
) {
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [prepTask, setPrepTask] = useState<TaskDTO | null>(null);
  const [prepType, setPrepType] = useState<AiPrepType>("CHECKLIST");
  const [prepOutputs, setPrepOutputs] = useState<AiPrepOutput[]>([]);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepFetchLoading, setPrepFetchLoading] = useState(false);
  const [prepActionLoadingId, setPrepActionLoadingId] = useState<string | null>(null);

  const loadPrepOutputs = useCallback(
    async (taskId: string) => {
      setPrepFetchLoading(true);
      try {
        const res = await apiFetch(`/api/ai/prep?taskId=${taskId}`);
        if (!res.ok) {
          onError?.("AIの下準備を読み込めませんでした");
          return;
        }
        const data = await res.json();
        setPrepOutputs(data.outputs ?? []);
      } catch {
        onError?.("AIの下準備を読み込めませんでした");
      } finally {
        setPrepFetchLoading(false);
      }
    },
    [onError],
  );

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
      if (!res.ok) {
        onError?.("AIの下準備を作れませんでした");
        return;
      }
      const data = await res.json();
      if (data.output) {
        setPrepOutputs((prev) => [data.output, ...prev]);
      }
      onSuccess?.("AIの下準備を作りました");
    } catch {
      onError?.("AIの下準備を作れませんでした");
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
      if (!res.ok) {
        onError?.("AIの下準備を更新できませんでした");
        return;
      }
      const data = await res.json();
      if (data.output) {
        setPrepOutputs((prev) =>
          prev.map((item) => (item.id === data.output.id ? data.output : item)),
        );
      }
      if (action === "apply" || action === "revert") {
        await fetchTasks();
      }
      onSuccess?.(action === "apply" ? "下準備を反映しました" : "下準備を更新しました");
    } catch {
      onError?.("AIの下準備を更新できませんでした");
    } finally {
      setPrepActionLoadingId(null);
    }
  };

  return {
    prepModalOpen,
    prepTask,
    prepType,
    setPrepType,
    prepOutputs,
    prepLoading,
    prepFetchLoading,
    prepActionLoadingId,
    openPrepModal,
    closePrepModal,
    generatePrepOutput,
    updatePrepOutput,
  };
}
