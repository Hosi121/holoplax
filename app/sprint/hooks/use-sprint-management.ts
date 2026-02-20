import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { SprintDTO } from "../../../lib/types";

export type SprintForm = {
  name: string;
  capacityPoints: number;
  startedAt: string;
  plannedEndAt: string;
};

export type SprintHistoryItem = SprintDTO & {
  committedPoints?: number;
  completedPoints?: number;
};

export type UseSprintManagementOptions = {
  ready: boolean;
  workspaceId: string | null;
  onSprintChange?: () => void;
};

const defaultSprintForm: SprintForm = {
  name: "",
  capacityPoints: 24,
  startedAt: "",
  plannedEndAt: "",
};

export function useSprintManagement({
  ready,
  workspaceId,
  onSprintChange,
}: UseSprintManagementOptions) {
  const [sprint, setSprint] = useState<SprintDTO | null>(null);
  const [sprintHistory, setSprintHistory] = useState<SprintHistoryItem[]>([]);
  const [sprintLoading, setSprintLoading] = useState(false);
  const [sprintForm, setSprintForm] = useState<SprintForm>(defaultSprintForm);

  const fetchSprint = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setSprint(null);
      return;
    }
    const res = await apiFetch("/api/sprints/current");
    if (!res.ok) return;
    const data = await res.json();
    const s = data.sprint ?? null;
    setSprint(s);
    if (s) {
      setSprintForm({
        name: s.name ?? "",
        capacityPoints: s.capacityPoints ?? 24,
        startedAt: s.startedAt ? String(s.startedAt).slice(0, 10) : "",
        plannedEndAt: s.plannedEndAt ? String(s.plannedEndAt).slice(0, 10) : "",
      });
    }
  }, [ready, workspaceId]);

  const fetchSprintHistory = useCallback(async () => {
    if (!ready || !workspaceId) {
      setSprintHistory([]);
      return;
    }
    const res = await apiFetch("/api/sprints");
    if (!res.ok) return;
    const data = await res.json();
    setSprintHistory(data.sprints ?? []);
  }, [ready, workspaceId]);

  const startSprint = async () => {
    setSprintLoading(true);
    try {
      const res = await apiFetch("/api/sprints/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sprintForm.name.trim() || undefined,
          capacityPoints: sprintForm.capacityPoints,
          plannedEndAt: sprintForm.plannedEndAt || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSprint(data.sprint ?? null);
        fetchSprintHistory();
        onSprintChange?.();
      }
    } finally {
      setSprintLoading(false);
    }
  };

  const endSprint = async () => {
    setSprintLoading(true);
    try {
      const res = await apiFetch("/api/sprints/current", { method: "PATCH" });
      if (res.ok) {
        await fetchSprint();
      }
      fetchSprintHistory();
      onSprintChange?.();
    } finally {
      setSprintLoading(false);
    }
  };

  const updateSprint = async () => {
    if (!sprint) return;
    setSprintLoading(true);
    try {
      const res = await apiFetch(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sprintForm.name,
          capacityPoints: sprintForm.capacityPoints,
          startedAt: sprintForm.startedAt || null,
          plannedEndAt: sprintForm.plannedEndAt || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSprint(data.sprint ?? null);
        fetchSprintHistory();
      }
    } finally {
      setSprintLoading(false);
    }
  };

  return {
    // State
    sprint,
    sprintHistory,
    sprintLoading,
    sprintForm,
    setSprintForm,
    // Actions
    fetchSprint,
    fetchSprintHistory,
    startSprint,
    endSprint,
    updateSprint,
  };
}
