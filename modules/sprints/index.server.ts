import { createSprintOperations } from "./application/sprint-operations";
import { prismaSprintOperationsPort } from "./infrastructure/prisma-sprint-operations";

const operations = createSprintOperations(prismaSprintOperationsPort);
export const listSprints = operations.list;
export const getCurrentSprint = operations.current;
export const createSprint = operations.create;
export const closeCurrentSprint = operations.close;
export const updateSprint = operations.update;

export type { SprintStartInput, SprintStatus, SprintUpdateInput } from "./domain/sprint-types";
