export type SprintStatus = "ACTIVE" | "CLOSED";

export type SprintStartInput = {
  name?: string;
  capacityPoints?: number;
  plannedEndAt?: string | null;
};

export type SprintUpdateInput = {
  name?: string;
  capacityPoints?: number;
  startedAt?: string | null;
  plannedEndAt?: string | null;
};
