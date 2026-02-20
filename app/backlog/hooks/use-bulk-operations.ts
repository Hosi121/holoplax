import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { TaskStatus } from "../../../lib/types";

type BulkAction = "status" | "delete" | "points";

export function useBulkOperations(onSuccess?: () => void) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleSelection = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((taskIds: string[]) => {
    setSelectedIds(new Set(taskIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      if (prev) {
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const performBulkAction = useCallback(
    async (action: BulkAction, options?: { status?: TaskStatus; points?: number }) => {
      if (selectedIds.size === 0) return;

      setLoading(true);
      try {
        const res = await apiFetch("/api/tasks/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            taskIds: Array.from(selectedIds),
            ...(options?.status ? { status: options.status } : {}),
            ...(options?.points !== undefined ? { points: options.points } : {}),
          }),
        });

        if (res.ok) {
          clearSelection();
          onSuccess?.();
          return true;
        } else {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error?.message ?? "操作に失敗しました");
        }
      } finally {
        setLoading(false);
      }
    },
    [selectedIds, clearSelection, onSuccess],
  );

  const bulkUpdateStatus = useCallback(
    (status: TaskStatus) => performBulkAction("status", { status }),
    [performBulkAction],
  );

  const bulkDelete = useCallback(() => performBulkAction("delete"), [performBulkAction]);

  const bulkUpdatePoints = useCallback(
    (points: number) => performBulkAction("points", { points }),
    [performBulkAction],
  );

  return {
    selectedIds,
    isSelectionMode,
    loading,
    toggleSelection,
    selectAll,
    clearSelection,
    toggleSelectionMode,
    bulkUpdateStatus,
    bulkDelete,
    bulkUpdatePoints,
    selectedCount: selectedIds.size,
  };
}
