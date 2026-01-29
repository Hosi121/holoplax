import { useCallback, useState } from "react";
import type { Severity, TaskType } from "../../../lib/types";

export type TaskSearchFilters = {
  q: string;
  types: TaskType[];
  urgency: Severity | null;
  risk: Severity | null;
  tags: string[];
  assigneeId: string | null;
  dueBefore: string | null;
  dueAfter: string | null;
  minPoints: number | null;
  maxPoints: number | null;
};

const defaultFilters: TaskSearchFilters = {
  q: "",
  types: [],
  urgency: null,
  risk: null,
  tags: [],
  assigneeId: null,
  dueBefore: null,
  dueAfter: null,
  minPoints: null,
  maxPoints: null,
};

export function useTaskSearch() {
  const [filters, setFilters] = useState<TaskSearchFilters>(defaultFilters);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const updateFilter = useCallback(
    <K extends keyof TaskSearchFilters>(key: K, value: TaskSearchFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const hasActiveFilters = useCallback(() => {
    return (
      filters.q !== "" ||
      filters.types.length > 0 ||
      filters.urgency !== null ||
      filters.risk !== null ||
      filters.tags.length > 0 ||
      filters.assigneeId !== null ||
      filters.dueBefore !== null ||
      filters.dueAfter !== null ||
      filters.minPoints !== null ||
      filters.maxPoints !== null
    );
  }, [filters]);

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.types.length) params.set("type", filters.types.join(","));
    if (filters.urgency) params.set("urgency", filters.urgency);
    if (filters.risk) params.set("risk", filters.risk);
    if (filters.tags.length) params.set("tags", filters.tags.join(","));
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
    if (filters.dueBefore) params.set("dueBefore", filters.dueBefore);
    if (filters.dueAfter) params.set("dueAfter", filters.dueAfter);
    if (filters.minPoints !== null) params.set("minPoints", String(filters.minPoints));
    if (filters.maxPoints !== null) params.set("maxPoints", String(filters.maxPoints));
    return params.toString();
  }, [filters]);

  return {
    filters,
    setFilters,
    updateFilter,
    resetFilters,
    hasActiveFilters,
    buildQueryParams,
    isFilterOpen,
    setIsFilterOpen,
  };
}
