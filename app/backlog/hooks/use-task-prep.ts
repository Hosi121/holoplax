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
export function useTaskPrep(fetchTasks: () => void | Promise<void>) {
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [prepTask, setPrepTask] = useState<TaskDTO | null>(null);
  const [prepType, setPrepType] = useState<AiPrepType>("CHECKLIST");
  const [prepOutputs, setPrepOutputs] = useState<AiPrepOutput[]>([]);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepFetchLoading, setPrepFetchLoading] = useState(false);
  const [prepActionLoadingId, setPrepActionLoadingId] = useState<string | null>(null);

  const loadPrepOutputs = useCallback(async (taskId: string) => {
    setPrepFetchLoading(true);
    try {
      const res = await apiFetch(`/api/ai/prep?taskId=${taskId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPrepOutputs(data.outputs ?? []);
    } finally {
      setPrepFetchLoading(false);
    }
  }, []);

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
      if (!res.ok) return;
      const data = await res.json();
      if (data.output) {
        setPrepOutputs((prev) => [data.output, ...prev]);
      }
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
      if (!res.ok) return;
      const data = await res.json();
      if (data.output) {
        setPrepOutputs((prev) =>
          prev.map((item) => (item.id === data.output.id ? data.output : item)),
        );
      }
      if (action === "apply" || action === "revert") {
        void fetchTasks();
      }
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
