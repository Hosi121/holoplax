import { SEVERITY, type Severity, TASK_STATUS, type TaskDTO } from "./types";

/**
 * スプリント最適化アルゴリズム
 *
 * 依存制約付きナップサック問題を貪欲法で解く
 * - 最大化: Σ (score[i] × x[i])
 * - 制約: Σ points[i] × x[i] ≤ capacity
 * - 制約: タスクiがタスクjに依存する場合、jが選ばれていないとiは選べない
 */

// urgency重み: HIGH=3, MEDIUM=2, LOW=1
const URGENCY_WEIGHT: Record<Severity, number> = {
  [SEVERITY.HIGH]: 3,
  [SEVERITY.MEDIUM]: 2,
  [SEVERITY.LOW]: 1,
};

// risk重み: HIGH=0.7, MEDIUM=1, LOW=1.2 (リスク高いと価値が下がる)
const RISK_WEIGHT: Record<Severity, number> = {
  [SEVERITY.HIGH]: 0.7,
  [SEVERITY.MEDIUM]: 1,
  [SEVERITY.LOW]: 1.2,
};

export type OptimizationResult = {
  selectedTasks: TaskDTO[];
  excludedTasks: { task: TaskDTO; reason: string }[];
  totalPoints: number;
  totalScore: number;
};

/**
 * タスクのスコアを計算
 * スコア = urgency重み × risk重み / points (効率重視)
 */
export function calculateTaskScore(task: TaskDTO): number {
  const urgencyW = URGENCY_WEIGHT[task.urgency] ?? 2;
  const riskW = RISK_WEIGHT[task.risk] ?? 1;
  // ポイントあたりの価値を計算（小さいタスクほど効率が良い）
  // Guard against a 0 / non-finite points value producing Infinity/NaN.
  const points = task.points > 0 ? task.points : 1;
  return (urgencyW * riskW) / points;
}

/**
 * タスクの絶対価値を計算（スコア×ポイント）
 */
function calculateTaskValue(task: TaskDTO): number {
  const urgencyW = URGENCY_WEIGHT[task.urgency] ?? 2;
  const riskW = RISK_WEIGHT[task.risk] ?? 1;
  return urgencyW * riskW * task.points;
}

type DependencyBundle = { tasks: TaskDTO[]; error: string | null };

function collectDependencyBundle(
  root: TaskDTO,
  taskMap: ReadonlyMap<string, TaskDTO>,
  selectedIds: ReadonlySet<string>,
): DependencyBundle {
  const ordered: TaskDTO[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (task: TaskDTO): string | null => {
    if (selectedIds.has(task.id) || visited.has(task.id)) return null;
    if (visiting.has(task.id)) return "依存関係が循環しています";
    visiting.add(task.id);
    for (const dependency of task.dependencies ?? []) {
      if (dependency.status === TASK_STATUS.DONE || selectedIds.has(dependency.id)) continue;
      const dependencyTask = taskMap.get(dependency.id);
      if (!dependencyTask || dependencyTask.status !== TASK_STATUS.BACKLOG) {
        return "未完了の依存タスクがバックログにありません";
      }
      const error = visit(dependencyTask);
      if (error) return error;
    }
    visiting.delete(task.id);
    visited.add(task.id);
    ordered.push(task);
    return null;
  };

  const error = visit(root);
  return { tasks: error ? [] : ordered, error };
}

/**
 * スプリント最適化のメイン関数
 */
export function optimizeSprint(backlogTasks: TaskDTO[], capacity: number): OptimizationResult {
  // バックログタスクのみをフィルタ
  const candidates = backlogTasks.filter((t) => t.status === TASK_STATUS.BACKLOG);

  if (candidates.length === 0) {
    return {
      selectedTasks: [],
      excludedTasks: [],
      totalPoints: 0,
      totalScore: 0,
    };
  }

  const taskMap = new Map<string, TaskDTO>();
  for (const task of candidates) {
    taskMap.set(task.id, task);
  }

  // Rank roots by value density. Each root is later evaluated together with
  // its complete transitive dependency closure.
  const ranked = [...candidates].sort((a, b) => {
    const scoreA = calculateTaskScore(a);
    const scoreB = calculateTaskScore(b);
    if (Math.abs(scoreA - scoreB) > 0.001) {
      return scoreB - scoreA;
    }
    // 同スコアならurgencyで比較
    return URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency];
  });

  const selectedTasks: TaskDTO[] = [];
  const excludedTasks: { task: TaskDTO; reason: string }[] = [];
  const selectedIds = new Set<string>();
  let totalPoints = 0;
  let totalScore = 0;

  for (const task of ranked) {
    if (selectedIds.has(task.id)) continue;
    const bundle = collectDependencyBundle(task, taskMap, selectedIds);
    if (bundle.error) {
      excludedTasks.push({ task, reason: bundle.error });
      continue;
    }
    const bundlePoints = bundle.tasks.reduce((sum, item) => sum + item.points, 0);
    if (totalPoints + bundlePoints > Math.max(0, capacity)) {
      excludedTasks.push({ task, reason: "依存タスクを含めるとキャパ超過" });
      continue;
    }
    for (const item of bundle.tasks) {
      if (selectedIds.has(item.id)) continue;
      selectedTasks.push(item);
      selectedIds.add(item.id);
      totalPoints += item.points;
      totalScore += calculateTaskValue(item);
    }
  }

  return {
    selectedTasks,
    excludedTasks,
    totalPoints,
    totalScore,
  };
}

/**
 * 最適化結果のサマリーを生成
 */
export function getOptimizationSummary(result: OptimizationResult, capacity: number): string {
  // Avoid NaN/Infinity utilization when capacity is 0 or invalid.
  const utilization = capacity > 0 ? Math.round((result.totalPoints / capacity) * 100) : 0;
  return `${result.selectedTasks.length}件選択 (${result.totalPoints}/${capacity}pt, 利用率${utilization}%)`;
}
