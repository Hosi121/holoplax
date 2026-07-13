import { createMemoryOperations } from "./application/memory-operations";
import { prismaMemoryOperationsPort } from "./infrastructure/prisma-memory-operations";

const operations = createMemoryOperations(prismaMemoryOperationsPort);
export const listMemory = operations.list;
export const createMemoryClaim = operations.createClaim;
export const deleteMemoryClaim = operations.deleteClaim;
export const listMemoryQuestions = operations.listQuestions;
export const createMemoryQuestion = operations.createQuestion;
export const actOnMemoryQuestion = operations.actOnQuestion;
