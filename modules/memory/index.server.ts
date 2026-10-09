import { createMemoryOperations } from "./application/memory-operations";
import { d1MemoryOperationsPort } from "./infrastructure/d1-memory-operations";

const operations = createMemoryOperations(d1MemoryOperationsPort);
export const listMemory = operations.list;
export const createMemoryClaim = operations.createClaim;
export const deleteMemoryClaim = operations.deleteClaim;
export const listMemoryQuestions = operations.listQuestions;
export const createMemoryQuestion = operations.createQuestion;
export const actOnMemoryQuestion = operations.actOnQuestion;
