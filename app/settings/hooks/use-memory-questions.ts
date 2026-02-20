import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export type MemoryQuestionRow = {
  id: string;
  typeId: string;
  valueStr?: string | null;
  valueNum?: number | null;
  valueBool?: boolean | null;
  valueJson?: unknown;
  confidence: number;
  status: string;
  createdAt: string;
  type: {
    key: string;
    scope: "USER" | "WORKSPACE";
    valueType: string;
    description?: string | null;
  };
};

export const formatQuestionValue = (question: MemoryQuestionRow) => {
  const type = question.type;
  if (type.valueType === "STRING") return question.valueStr ?? "";
  if (
    type.valueType === "NUMBER" ||
    type.valueType === "DURATION_MS" ||
    type.valueType === "RATIO"
  ) {
    return question.valueNum !== null && question.valueNum !== undefined
      ? String(question.valueNum)
      : "";
  }
  if (type.valueType === "BOOL") {
    if (question.valueBool === null || question.valueBool === undefined) return "";
    return question.valueBool ? "true" : "false";
  }
  if (
    type.valueType === "JSON" ||
    type.valueType === "HISTOGRAM_24x7" ||
    type.valueType === "RATIO_BY_TYPE"
  ) {
    if (question.valueJson === null || question.valueJson === undefined) return "";
    return JSON.stringify(question.valueJson, null, 2);
  }
  return "";
};

export type UseMemoryQuestionsOptions = {
  ready: boolean;
  onAccept?: () => void;
};

export function useMemoryQuestions({ ready, onAccept }: UseMemoryQuestionsOptions) {
  const [memoryQuestions, setMemoryQuestions] = useState<MemoryQuestionRow[]>([]);
  const [memoryQuestionLoading, setMemoryQuestionLoading] = useState(false);
  const [memoryQuestionActionId, setMemoryQuestionActionId] = useState<string | null>(null);

  const fetchMemoryQuestions = useCallback(async () => {
    if (!ready) return;
    setMemoryQuestionLoading(true);
    try {
      const res = await apiFetch("/api/memory/questions");
      if (!res.ok) return;
      const data = await res.json();
      setMemoryQuestions(data.questions ?? []);
    } finally {
      setMemoryQuestionLoading(false);
    }
  }, [ready]);

  const activeQuestion = useMemo(() => memoryQuestions[0] ?? null, [memoryQuestions]);

  const respondMemoryQuestion = async (
    question: MemoryQuestionRow,
    action: "accept" | "reject" | "hold",
  ) => {
    setMemoryQuestionActionId(question.id);
    try {
      const res = await apiFetch(`/api/memory/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      setMemoryQuestions((prev) => prev.filter((item) => item.id !== question.id));
      if (action === "accept") {
        onAccept?.();
      }
    } finally {
      setMemoryQuestionActionId(null);
    }
  };

  return {
    memoryQuestions,
    memoryQuestionLoading,
    memoryQuestionActionId,
    activeQuestion,
    fetchMemoryQuestions,
    respondMemoryQuestion,
  };
}
