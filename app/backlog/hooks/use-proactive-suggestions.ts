import { useMemo } from "react";
import type { TaskDTO } from "../../../lib/types";
import type { AiContext } from "./use-suggestion-context";

type SuggestionType = "TIP" | "SCORE" | "SPLIT";

type ProactiveSuggestion = {
  type: SuggestionType;
  reason: string;
  priority: number;
};

type TriggerCondition = {
  type: SuggestionType;
  priority: number;
  reason: string;
  when: (ctx: AiContext, task: TaskDTO) => boolean;
};

const ACCEPT_RATE_THRESHOLD = 0.3;
const WIP_LIMIT = 5;

const TRIGGERS: TriggerCondition[] = [
  // SPLIT: 高ポイントタスク（8pt以上）でBACKLOG状態
  {
    type: "SPLIT",
    priority: 100,
    reason: "タスクが大きいため分解を提案します",
    when: (ctx, task) =>
      task.points >= 8 &&
      task.status === "BACKLOG" &&
      !task.parentId && // 既に子タスクでない
      (ctx.acceptRates.split ?? 0.5) >= ACCEPT_RATE_THRESHOLD,
  },

  // SCORE: ポイントがデフォルト値（1pt）のまま
  {
    type: "SCORE",
    priority: 80,
    reason: "ポイントが未設定のため見積もりを提案します",
    when: (ctx, task) =>
      task.points === 1 &&
      task.title.length > 10 && // タイトルがある程度ある
      task.status === "BACKLOG" &&
      (ctx.acceptRates.score ?? 0.5) >= ACCEPT_RATE_THRESHOLD,
  },

  // TIP: 説明が空で、flow_stateが低い（詰まってる）
  {
    type: "TIP",
    priority: 60,
    reason: "作業の進め方についてヒントを提案します",
    when: (ctx, task) =>
      (!task.description || task.description.length < 20) &&
      task.status !== "DONE" &&
      (ctx.flowState === null || ctx.flowState < 0.4) &&
      (ctx.acceptRates.tip ?? 0.5) >= ACCEPT_RATE_THRESHOLD,
  },

  // SPLIT: 説明が長くて複雑そう
  {
    type: "SPLIT",
    priority: 70,
    reason: "タスクの説明が複雑なため分解を提案します",
    when: (ctx, task) =>
      task.points >= 5 &&
      (task.description?.length ?? 0) > 200 &&
      task.status === "BACKLOG" &&
      !task.parentId &&
      (ctx.acceptRates.split ?? 0.5) >= ACCEPT_RATE_THRESHOLD,
  },
];

/**
 * タスクに対してプロアクティブに表示すべき提案を判定する
 */
export function useProactiveSuggestions(
  task: TaskDTO | null,
  context: AiContext | null,
): ProactiveSuggestion | null {
  return useMemo(() => {
    if (!task || !context) return null;

    // WIPが多すぎる場合は提案しない（邪魔しない）
    if (context.wipCount > WIP_LIMIT) return null;

    // 条件を評価して最初にマッチしたものを返す（priority順にソート済み）
    const sortedTriggers = [...TRIGGERS].sort((a, b) => b.priority - a.priority);

    for (const trigger of sortedTriggers) {
      if (trigger.when(context, task)) {
        return {
          type: trigger.type,
          reason: trigger.reason,
          priority: trigger.priority,
        };
      }
    }

    return null;
  }, [task, context]);
}

/**
 * 複数タスクに対して提案が必要なものをフィルタリング
 */
export function useProactiveSuggestionsList(
  tasks: TaskDTO[],
  context: AiContext | null,
): Map<string, ProactiveSuggestion> {
  return useMemo(() => {
    const result = new Map<string, ProactiveSuggestion>();

    if (!context || context.wipCount > WIP_LIMIT) return result;

    const sortedTriggers = [...TRIGGERS].sort((a, b) => b.priority - a.priority);

    for (const task of tasks) {
      for (const trigger of sortedTriggers) {
        if (trigger.when(context, task)) {
          result.set(task.id, {
            type: trigger.type,
            reason: trigger.reason,
            priority: trigger.priority,
          });
          break; // 1タスクにつき1提案
        }
      }
    }

    return result;
  }, [tasks, context]);
}
