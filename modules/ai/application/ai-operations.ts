import { ApplicationError } from "../../shared/application/application-error";

export type AiPrepType = "EMAIL" | "IMPLEMENTATION" | "CHECKLIST";
export type AiPrepAction = "approve" | "reject" | "apply" | "revert";
export type SuggestionReaction = "VIEWED" | "ACCEPTED" | "MODIFIED" | "REJECTED" | "IGNORED";
export type AiSuggestInput = { title?: string; description?: string; taskId?: string | null };
export type AiScoreInput = { title: string; description?: string; taskId?: string | null };
export type AiSplitInput = {
  title: string;
  description?: string;
  points: 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34;
  taskId?: string | null;
};

type AcceptRates = { tip: number | null; score: number | null; split: number | null };

export interface AiOperationsPort {
  loadContext(
    userId: string,
    workspaceId: string | null,
  ): Promise<{
    flowState: number | null;
    wipCount: number;
    acceptRates: AcceptRates;
    avgLatencyMs: number | null;
  }>;
  listLogs(workspaceId: string): Promise<unknown[]>;
  listPrep(workspaceId: string, taskId: string): Promise<unknown[]>;
  generatePrep(input: {
    userId: string;
    workspaceId: string;
    taskId: string;
    type: AiPrepType;
    source?: string;
    audit?: boolean;
  }): Promise<{ id: string } & Record<string, unknown>>;
  actOnPrep(input: {
    userId: string;
    workspaceId: string;
    prepId: string;
    action: AiPrepAction;
  }): Promise<unknown>;
  recordReaction(input: {
    userId: string;
    workspaceId: string;
    suggestionId: string;
    reaction: SuggestionReaction;
    context?: {
      taskType?: string;
      taskPoints?: number;
      hourOfDay?: number;
      dayOfWeek?: number;
      wipCount?: number;
      flowState?: number;
    };
    modification?: Record<string, unknown> | null;
    viewedAt?: string;
    reactedAt?: string;
  }): Promise<void>;
  generateScore(
    actor: { userId: string; workspaceId: string },
    input: AiScoreInput,
  ): Promise<{
    points: number;
    urgency: "LOW" | "MEDIUM" | "HIGH";
    risk: "LOW" | "MEDIUM" | "HIGH";
    score: number;
    reason: string;
    suggestionId: string;
  }>;
  generateSplit(
    actor: { userId: string; workspaceId: string },
    input: AiSplitInput,
  ): Promise<{
    suggestions: Array<{
      title: string;
      detail: string;
      points: number;
      urgency: "LOW" | "MEDIUM" | "HIGH";
      risk: "LOW" | "MEDIUM" | "HIGH";
    }>;
    suggestionId: string;
  }>;
  generateSuggestion(
    actor: { userId: string; workspaceId: string },
    input: AiSuggestInput,
  ): Promise<{ suggestion: string; suggestionId: string }>;
  latestSuggestion(
    workspaceId: string,
    taskId: string,
  ): Promise<{
    suggestion: string | null;
    suggestionId: string | null;
  }>;
}

const prepTypes = new Set<AiPrepType>(["EMAIL", "IMPLEMENTATION", "CHECKLIST"]);
const prepActions = new Set<AiPrepAction>(["approve", "reject", "apply", "revert"]);
const badRequest = (message: string) =>
  new ApplicationError("AI_BAD_REQUEST", message, "bad_request");

const recommendations = (context: {
  flowState: number | null;
  wipCount: number;
  acceptRates: AcceptRates;
}) => {
  if (context.wipCount > 5) return [];
  const result: Array<{
    type: "TIP" | "SCORE" | "SPLIT";
    reason: string;
    confidence: number;
  }> = [];
  const split = context.acceptRates.split ?? 0.5;
  if (split >= 0.3) {
    result.push({
      type: "SPLIT",
      reason: "高ポイントタスクの分解で作業を進めやすくします",
      confidence: split,
    });
  }
  const score = context.acceptRates.score ?? 0.5;
  if (score >= 0.3) {
    result.push({
      type: "SCORE",
      reason: "ポイント未設定のタスクに見積もりを提案します",
      confidence: score,
    });
  }
  const tip = context.acceptRates.tip ?? 0.5;
  if (tip >= 0.3 && (context.flowState === null || context.flowState < 0.4)) {
    result.push({
      type: "TIP",
      reason: "作業の進め方についてヒントを提案します",
      confidence: tip,
    });
  }
  return result.sort((left, right) => right.confidence - left.confidence);
};

export const createAiOperations = (port: AiOperationsPort) => ({
  getContext: async (userId: string, workspaceId: string | null) => {
    const context = await port.loadContext(userId, workspaceId);
    return { ...context, recommendations: recommendations(context) };
  },
  listLogs: (workspaceId: string) => port.listLogs(workspaceId),
  listPrep: (workspaceId: string, taskId: string) => port.listPrep(workspaceId, taskId),
  generatePrep: (
    input: Omit<Parameters<AiOperationsPort["generatePrep"]>[0], "type"> & { type: string },
  ) => {
    if (!prepTypes.has(input.type as AiPrepType)) throw badRequest("invalid type");
    return port.generatePrep({ ...input, type: input.type as AiPrepType });
  },
  actOnPrep: (
    input: Omit<Parameters<AiOperationsPort["actOnPrep"]>[0], "action"> & { action: string },
  ) => {
    if (!prepActions.has(input.action as AiPrepAction)) throw badRequest("invalid action");
    return port.actOnPrep({ ...input, action: input.action as AiPrepAction });
  },
  recordReaction: (input: Parameters<AiOperationsPort["recordReaction"]>[0]) =>
    port.recordReaction(input),
  generateScore: (actor: { userId: string; workspaceId: string }, input: AiScoreInput) =>
    port.generateScore(actor, input),
  generateSplit: (actor: { userId: string; workspaceId: string }, input: AiSplitInput) =>
    port.generateSplit(actor, input),
  generateSuggestion: (actor: { userId: string; workspaceId: string }, input: AiSuggestInput) =>
    port.generateSuggestion(actor, input),
  latestSuggestion: (workspaceId: string, taskId: string) =>
    port.latestSuggestion(workspaceId, taskId),
});
