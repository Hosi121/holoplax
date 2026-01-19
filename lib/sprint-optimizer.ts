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
  return (urgencyW * riskW) / task.points;
}

/**
 * タスクの絶対価値を計算（スコア×ポイント）
 */
export function calculateTaskValue(task: TaskDTO): number {
  const urgencyW = URGENCY_WEIGHT[task.urgency] ?? 2;
  const riskW = RISK_WEIGHT[task.risk] ?? 1;
  return urgencyW * riskW * task.points;
}

/**
 * 依存関係を考慮したトポロジカルソート
 * 依存先が先に来るようにソート
 */
function topologicalSort(tasks: TaskDTO[]): TaskDTO[] {
  const taskMap = new Map<string, TaskDTO>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  const visited = new Set<string>();
  const result: TaskDTO[] = [];

  function visit(task: TaskDTO) {
    if (visited.has(task.id)) return;
    visited.add(task.id);

    // 依存先を先に処理
    for (const dep of task.dependencies ?? []) {
      const depTask = taskMap.get(dep.id);
      if (depTask) {
        visit(depTask);
      }
    }

    result.push(task);
  }

  for (const task of tasks) {
    visit(task);
  }

  return result;
}

/**
 * 依存関係が満たされているかチェック
 */
function areDependenciesSatisfied(
  task: TaskDTO,
  selectedIds: Set<string>,
  allTasks: Map<string, TaskDTO>,
): boolean {
  for (const dep of task.dependencies ?? []) {
    // 依存先が完了済みならOK
    if (dep.status === TASK_STATUS.DONE) continue;

    // 依存先がバックログにあり、選択されていない場合はNG
    const depTask = allTasks.get(dep.id);
    if (depTask && depTask.status === TASK_STATUS.BACKLOG && !selectedIds.has(dep.id)) {
      return false;
    }
  }
  return true;
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

  // トポロジカルソートして依存順に並べる
  const sorted = topologicalSort(candidates);

  // スコアでソート（高い順）、同スコアならurgencyが高い順
  sorted.sort((a, b) => {
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

  // 貪欲法で選択
  for (const task of sorted) {
    // キャパチェック
    if (totalPoints + task.points > capacity) {
      excludedTasks.push({ task, reason: "キャパ超過" });
      continue;
    }

    // 依存関係チェック
    if (!areDependenciesSatisfied(task, selectedIds, taskMap)) {
      // 依存先も追加を試みる
      const missingDeps: TaskDTO[] = [];
      let canAddWithDeps = true;
      let additionalPoints = 0;

      for (const dep of task.dependencies ?? []) {
        if (dep.status === TASK_STATUS.DONE) continue;
        if (selectedIds.has(dep.id)) continue;

        const depTask = taskMap.get(dep.id);
        if (depTask) {
          missingDeps.push(depTask);
          additionalPoints += depTask.points;
        } else {
          // 依存先がバックログにない（別のステータス）
          canAddWithDeps = false;
          break;
        }
      }

      if (!canAddWithDeps || totalPoints + task.points + additionalPoints > capacity) {
        excludedTasks.push({ task, reason: "依存タスクが未選択" });
        continue;
      }

      // 依存先も一緒に追加
      for (const dep of missingDeps) {
        if (!selectedIds.has(dep.id)) {
          selectedTasks.push(dep);
          selectedIds.add(dep.id);
          totalPoints += dep.points;
          totalScore += calculateTaskValue(dep);
        }
      }
    }

    // タスクを選択
    selectedTasks.push(task);
    selectedIds.add(task.id);
    totalPoints += task.points;
    totalScore += calculateTaskValue(task);
  }

  // 選択されたタスクを依存順に並べ直す
  const finalOrder = topologicalSort(selectedTasks);

  return {
    selectedTasks: finalOrder,
    excludedTasks,
    totalPoints,
    totalScore,
  };
}

/**
 * 最適化結果のサマリーを生成
 */
export function getOptimizationSummary(result: OptimizationResult, capacity: number): string {
  const utilization = Math.round((result.totalPoints / capacity) * 100);
  return `${result.selectedTasks.length}件選択 (${result.totalPoints}/${capacity}pt, 利用率${utilization}%)`;
}
