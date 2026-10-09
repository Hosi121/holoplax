import { createSprintOperations } from "./application/sprint-operations";
import { d1SprintOperationsPort } from "./infrastructure/d1-sprint-operations";

const operations = createSprintOperations(d1SprintOperationsPort);
export const listSprints = operations.list;
export const getCurrentSprint = operations.current;
export const createSprint = operations.create;
export const closeCurrentSprint = operations.close;
export const updateSprint = operations.update;

export type { SprintStartInput, SprintStatus, SprintUpdateInput } from "./domain/sprint-types";
