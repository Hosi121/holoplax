import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export type MemoryDefinitionRow = {
  id: string;
  key: string;
  scope: "USER" | "WORKSPACE";
  valueType: string;
  unit?: string | null;
  granularity: string;
  updatePolicy: string;
  decayDays?: number | null;
  description?: string | null;
};

export type MemoryClaimRow = {
  id: string;
  definitionId: string;
  valueStr?: string | null;
  valueNum?: number | null;
  valueBool?: boolean | null;
  valueJson?: unknown;
  status: string;
};

export const formatClaimValue = (type: MemoryDefinitionRow, claim?: MemoryClaimRow) => {
  if (!claim) return "";
  if (type.valueType === "STRING") return claim.valueStr ?? "";
  if (
    type.valueType === "NUMBER" ||
    type.valueType === "DURATION_MS" ||
    type.valueType === "RATIO"
  ) {
    return claim.valueNum !== null && claim.valueNum !== undefined ? String(claim.valueNum) : "";
  }
  if (type.valueType === "BOOL") {
    return claim.valueBool === null || claim.valueBool === undefined
      ? ""
      : claim.valueBool
        ? "true"
        : "false";
  }
  if (
    type.valueType === "JSON" ||
    type.valueType === "HISTOGRAM_24x7" ||
    type.valueType === "RATIO_BY_TYPE"
  ) {
    if (claim.valueJson === null || claim.valueJson === undefined) return "";
    return JSON.stringify(claim.valueJson, null, 2);
  }
  return "";
};

export type UseMemoryOptions = {
  ready: boolean;
  workspaceId: string | null;
  onWarning?: (message: string) => void;
};

export function useMemory({ ready, workspaceId, onWarning }: UseMemoryOptions) {
  const [memoryDefinitions, setMemoryDefinitions] = useState<MemoryDefinitionRow[]>([]);
  const [memoryClaims, setMemoryClaims] = useState<Record<string, MemoryClaimRow>>({});
  const [memoryDrafts, setMemoryDrafts] = useState<Record<string, string>>({});
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySavingId, setMemorySavingId] = useState<string | null>(null);
  const [memoryRemovingId, setMemoryRemovingId] = useState<string | null>(null);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);

  const fetchMemory = useCallback(async () => {
    if (!ready) return;
    setMemoryLoading(true);
    try {
      // workspaceId is used to trigger refetch when workspace changes
      void workspaceId;
      const res = await apiFetch("/api/memory");
      if (!res.ok) return;
      const data = await res.json();
      const types: MemoryDefinitionRow[] = data.definitions ?? [];
      const claimMap: Record<string, MemoryClaimRow> = {};
      (data.userClaims ?? []).forEach((claim: MemoryClaimRow) => {
        claimMap[claim.definitionId] = claim;
      });
      (data.workspaceClaims ?? []).forEach((claim: MemoryClaimRow) => {
        claimMap[claim.definitionId] = claim;
      });
      const drafts: Record<string, string> = {};
      types.forEach((type) => {
        drafts[type.id] = formatClaimValue(type, claimMap[type.id]);
      });
      setMemoryDefinitions(types);
      setMemoryClaims(claimMap);
      setMemoryDrafts(drafts);
    } finally {
      setMemoryLoading(false);
    }
  }, [ready, workspaceId]);

  const userMemoryDefinitions = useMemo(
    () => memoryDefinitions.filter((type) => type.scope === "USER"),
    [memoryDefinitions],
  );

  const workspaceMemoryDefinitions = useMemo(
    () => memoryDefinitions.filter((type) => type.scope === "WORKSPACE"),
    [memoryDefinitions],
  );

  const handleMemoryDraftChange = (definitionId: string, value: string) => {
    setMemoryDrafts((prev) => ({ ...prev, [definitionId]: value }));
  };

  const saveMemory = async (type: MemoryDefinitionRow) => {
    const value = memoryDrafts[type.id];
    if (value === undefined || value === "") {
      onWarning?.("値を入力してください。");
      return;
    }
    setMemorySavingId(type.id);
    try {
      const res = await apiFetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definitionId: type.id, value }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.claim) {
        setMemoryClaims((prev) => ({ ...prev, [type.id]: data.claim }));
        setMemoryDrafts((prev) => ({
          ...prev,
          [type.id]: formatClaimValue(type, data.claim),
        }));
      }
    } finally {
      setMemorySavingId(null);
    }
  };

  const removeMemory = async (type: MemoryDefinitionRow) => {
    const claim = memoryClaims[type.id];
    if (!claim) return;
    setMemoryRemovingId(claim.id);
    try {
      const res = await apiFetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: claim.id }),
      });
      if (!res.ok) return;
      setMemoryClaims((prev) => {
        const next = { ...prev };
        delete next[type.id];
        return next;
      });
      setMemoryDrafts((prev) => ({ ...prev, [type.id]: "" }));
    } finally {
      setMemoryRemovingId(null);
    }
  };

  const cancelEdit = (definitionId: string) => {
    setEditingMemoryId(null);
    setMemoryDrafts((prev) => ({
      ...prev,
      [definitionId]: formatClaimValue(
        memoryDefinitions.find((t) => t.id === definitionId)!,
        memoryClaims[definitionId],
      ),
    }));
  };

  return {
    memoryDefinitions,
    memoryClaims,
    memoryDrafts,
    memoryLoading,
    memorySavingId,
    memoryRemovingId,
    editingMemoryId,
    userMemoryDefinitions,
    workspaceMemoryDefinitions,
    fetchMemory,
    handleMemoryDraftChange,
    saveMemory,
    removeMemory,
    setEditingMemoryId,
    cancelEdit,
  };
}
