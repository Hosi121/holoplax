import { SEVERITY, type Severity, TASK_STATUS, type TaskDTO } from "./types";

/**
 * デイリーフォーカス選択アルゴリズム
 *
 * 「今やるべきこと」を自動選択する
 * - ブロックされていない
 * - 期限が近い
 * - 緊急度が高い
 * - 小さいタスクで着手しやすい
 */

const URGENCY_WEIGHT: Record<Severity, number> = {
  [SEVERITY.HIGH]: 3,
  [SEVERITY.MEDIUM]: 2,
  [SEVERITY.LOW]: 1,
};

type FocusTask = {
  task: TaskDTO;
  score: number;
  reasons: string[];
};

export type DailyFocusResult = {
  focusTasks: FocusTask[];
  skippedTasks: { task: TaskDTO; reason: string }[];
  totalPoints: number;
};

/**
 * タスクがブロックされているかチェック
 */
function isBlocked(task: TaskDTO): boolean {
  return (task.dependencies ?? []).some((dep) => dep.workflowState !== "DONE");
}

/**
 * 期限までの日数を計算（期限なしはInfinity）
 */
function daysUntilDue(task: TaskDTO): number {
  if (!task.dueDate) return Infinity;
  const due = new Date(task.dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * フォーカススコアを計算
 *
 * 高いほど優先:
 * - 期限が近い → スコア高
 * - 緊急度が高い → スコア高
 * - ポイントが小さい → スコア高（着手しやすい）
 */
function calculateFocusScore(task: TaskDTO): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // 期限スコア (0-50点)
  const days = daysUntilDue(task);
  if (days <= 0) {
    score += 50;
    reasons.push("期限超過");
  } else if (days <= 1) {
    score += 40;
    reasons.push("今日が期限");
  } else if (days <= 3) {
    score += 30;
    reasons.push("期限が近い");
  } else if (days <= 7) {
    score += 15;
  } else if (days !== Infinity) {
    score += 5;
  }

  // 緊急度スコア (0-30点)
  const urgencyScore = URGENCY_WEIGHT[task.urgency] * 10;
  score += urgencyScore;
  if (task.urgency === SEVERITY.HIGH) {
    reasons.push("緊急度:高");
  }

  // サイズスコア (0-20点) - 小さいほど高い
  // 1pt=20, 2pt=18, 3pt=15, 5pt=10, 8pt=5, 13+=0
  const sizeScore = Math.max(0, 20 - task.points * 2);
  score += sizeScore;
  if (task.points <= 2) {
    reasons.push("すぐ終わる");
  }

  return { score, reasons };
}

/**
 * 今日のフォーカスタスクを選択
 */
export function selectDailyFocus(
  tasks: TaskDTO[],
  options: {
    maxTasks?: number;
    maxPoints?: number;
    includeBacklog?: boolean;
  } = {},
): DailyFocusResult {
  const { maxTasks = 3, maxPoints = 8, includeBacklog = false } = options;

  const candidates: TaskDTO[] = [];
  const skippedTasks: { task: TaskDTO; reason: string }[] = [];

  // フィルタリング
  for (const task of tasks) {
    // 完了済みはスキップ
    if (task.workflowState === "DONE" || task.workflowState === "CANCELED") {
      continue;
    }

    // バックログはオプションで含める
    if (task.status === TASK_STATUS.BACKLOG && !includeBacklog) {
      continue;
    }

    // SPRINTまたはBACKLOG（オプション時）のみ
    if (task.status !== TASK_STATUS.SPRINT && task.status !== TASK_STATUS.BACKLOG) {
      continue;
    }

    // ブロックされている
    if (isBlocked(task)) {
      skippedTasks.push({ task, reason: "依存タスクが未完了" });
      continue;
    }

    candidates.push(task);
  }

  // スコア計算してソート
  const scored = candidates.map((task) => {
    const { score, reasons } = calculateFocusScore(task);
    return { task, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  // 上位を選択（ポイント上限も考慮）
  const selected: FocusTask[] = [];
  let totalPoints = 0;

  for (const item of scored) {
    if (selected.length >= maxTasks) break;
    if (totalPoints + item.task.points > maxPoints) {
      // ポイントオーバーでもmaxTasksに達してなければ小さいのを探す
      continue;
    }
    selected.push(item);
    totalPoints += item.task.points;
  }

  return {
    focusTasks: selected,
    skippedTasks,
    totalPoints,
  };
}

/**
 * フォーカス結果のサマリーを生成
 */
export function getFocusSummary(result: DailyFocusResult): string {
  const { focusTasks, totalPoints } = result;
  if (focusTasks.length === 0) {
    return "今やるべきタスクはありません";
  }
  return `${focusTasks.length}件 / ${totalPoints}pt`;
}
