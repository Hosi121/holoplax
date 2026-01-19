import { useState, useCallback } from "react";
import { TASK_STATUS, TASK_TYPE, AUTOMATION_STATE, TaskDTO } from "../../../lib/types";

type SplitSuggestion = {
  title: string;
  points: number;
  urgency: string;
  risk: string;
  detail: string;
};

type ScoreResult = {
  points: number;
  urgency: string;
  risk: string;
  reason?: string;
  suggestionId?: string | null;
};

type TipResult = {
  text: string;
  suggestionId?: string | null;
};

export type UseAiSuggestionsOptions = {
  fetchTasks: () => Promise<void>;
  setItems: React.Dispatch<React.SetStateAction<TaskDTO[]>>;
};

export function useAiSuggestions({
  fetchTasks,
  setItems,
}: UseAiSuggestionsOptions) {
  const [suggestionMap, setSuggestionMap] = useState<Record<string, TipResult>>(
    {},
  );
  const [scoreMap, setScoreMap] = useState<Record<string, ScoreResult>>({});
  const [splitMap, setSplitMap] = useState<Record<string, SplitSuggestion[]>>(
    {},
  );
  const [splitSuggestionIdMap, setSplitSuggestionIdMap] = useState<
    Record<string, string | null>
  >({});

  const [suggestLoadingId, setSuggestLoadingId] = useState<string | null>(null);
  const [scoreLoadingId, setScoreLoadingId] = useState<string | null>(null);
  const [splitLoadingId, setSplitLoadingId] = useState<string | null>(null);

  const getSuggestion = async (
    title: string,
    description?: string,
    taskId?: string,
  ) => {
    setSuggestLoadingId(taskId ?? title);
    try {
      if (taskId) {
        const cached = await fetch(
          `/api/ai/suggest?taskId=${encodeURIComponent(taskId)}`,
        );
        if (cached.ok) {
          const data = await cached.json();
          if (data.suggestion !== null && data.suggestion !== undefined) {
            setSuggestionMap((prev) => ({
              ...prev,
              [taskId]: { text: data.suggestion, suggestionId: data.suggestionId },
            }));
            return;
          }
        }
      }
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, taskId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (taskId) {
        setSuggestionMap((prev) => ({
          ...prev,
          [taskId]: { text: data.suggestion, suggestionId: data.suggestionId },
        }));
      }
    } finally {
      setSuggestLoadingId(null);
    }
  };

  const estimateScoreForTask = async (item: TaskDTO) => {
    setScoreLoadingId(item.id);
    try {
      const res = await fetch("/api/ai/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          description: item.description ?? "",
          taskId: item.id,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScoreMap((prev) => ({
        ...prev,
        [item.id]: {
          points: Number(data.points) || item.points,
          urgency: data.urgency ?? item.urgency,
          risk: data.risk ?? item.risk,
          reason: data.reason,
          suggestionId: data.suggestionId,
        },
      }));
    } finally {
      setScoreLoadingId(null);
    }
  };

  const applyTipSuggestion = async (itemId: string) => {
    const suggestion = suggestionMap[itemId];
    if (!suggestion) return;
    await fetch("/api/ai/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: itemId,
        type: "TIP",
        suggestionId: suggestion.suggestionId,
        payload: { text: suggestion.text },
      }),
    });
    void fetchTasks();
  };

  const applyScoreSuggestion = async (itemId: string) => {
    const score = scoreMap[itemId];
    if (!score) return;
    await fetch("/api/ai/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: itemId,
        type: "SCORE",
        suggestionId: score.suggestionId,
        payload: {
          points: score.points,
          urgency: score.urgency,
          risk: score.risk,
        },
      }),
    });
    void fetchTasks();
  };

  const requestSplit = async (item: TaskDTO) => {
    setSplitLoadingId(item.id);
    try {
      const res = await fetch("/api/ai/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          description: item.description ?? "",
          points: item.points,
          taskId: item.id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSplitMap((prev) => ({ ...prev, [item.id]: data.suggestions ?? [] }));
        setSplitSuggestionIdMap((prev) => ({
          ...prev,
          [item.id]: data.suggestionId ?? null,
        }));
      }
    } finally {
      setSplitLoadingId(null);
    }
  };

  const applySplit = async (item: TaskDTO, view: "product" | "sprint") => {
    const suggestions = splitMap[item.id] ?? [];
    if (!suggestions.length) return;
    // Optimistic update
    setItems((prev) =>
      prev.map((t) =>
        t.id === item.id
          ? { ...t, automationState: AUTOMATION_STATE.SPLIT_PARENT }
          : t,
      ),
    );
    setSplitMap((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setSplitSuggestionIdMap((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    const statusValue =
      view === "sprint" ? TASK_STATUS.SPRINT : TASK_STATUS.BACKLOG;
    await Promise.all(
      suggestions.map((split) =>
        fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: split.title,
            description: split.detail,
            points: split.points,
            urgency: split.urgency ?? "中",
            risk: split.risk ?? "中",
            status: statusValue,
            type: TASK_TYPE.TASK,
            parentId: item.id,
          }),
        }),
      ),
    );
    await fetch(`/api/tasks/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automationState: AUTOMATION_STATE.SPLIT_PARENT }),
    });
    await fetch("/api/ai/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: item.id,
        type: "SPLIT",
        suggestionId: splitSuggestionIdMap[item.id] ?? null,
      }),
    });
    await fetchTasks();
  };

  return {
    // State
    suggestionMap,
    scoreMap,
    splitMap,
    suggestLoadingId,
    scoreLoadingId,
    splitLoadingId,
    // Actions
    getSuggestion,
    estimateScoreForTask,
    applyTipSuggestion,
    applyScoreSuggestion,
    requestSplit,
    applySplit,
  };
}
