import type { SprintStatus as SprintStatusType } from "./domain/sprint-types";

export type SprintStatus = SprintStatusType;

export const SprintStatus = { ACTIVE: "ACTIVE", CLOSED: "CLOSED" } as const;
