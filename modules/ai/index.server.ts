import { createAiOperations } from "./application/ai-operations";
import { prismaAiOperationsPort } from "./infrastructure/prisma-ai-operations";

const operations = createAiOperations(prismaAiOperationsPort);
export const getAiContext = operations.getContext;
export const listAiLogs = operations.listLogs;
export const listAiPrep = operations.listPrep;
export const generateAiPrep = operations.generatePrep;
export const actOnAiPrep = operations.actOnPrep;
export const recordAiReaction = operations.recordReaction;
export const generateAiScore = operations.generateScore;
export const generateAiSplit = operations.generateSplit;
export const generateAiSuggestion = operations.generateSuggestion;
export const getLatestAiSuggestion = operations.latestSuggestion;

export type { AiScoreInput, AiSplitInput, AiSuggestInput } from "./application/ai-operations";
