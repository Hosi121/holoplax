import {
  type AiScoreInput,
  type AiSplitInput,
  type AiSuggestInput,
  generateAiScore,
  generateAiSplit,
  generateAiSuggestion,
} from "../../../lib/ai/ai-service.js";
import type { SplitItem } from "../../../lib/ai-suggestions.js";
import type { ExecutionContext } from "../context.js";

export type { AiScoreInput, AiSplitInput, AiSuggestInput, SplitItem };

export const aiScore = (ctx: ExecutionContext, input: AiScoreInput) =>
  generateAiScore({ userId: ctx.userId, workspaceId: ctx.workspaceId, input });

export const aiSplit = (ctx: ExecutionContext, input: AiSplitInput) =>
  generateAiSplit({ userId: ctx.userId, workspaceId: ctx.workspaceId, input });

export const aiSuggest = (ctx: ExecutionContext, input: AiSuggestInput) =>
  generateAiSuggestion({ userId: ctx.userId, workspaceId: ctx.workspaceId, input });
