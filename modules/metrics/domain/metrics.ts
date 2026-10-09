const DAY = 86_400_000;
export type MetricTask = {
  workflowState: string;
  createdAt: number | null;
  doneAt: number | null;
  dueDate: number | null;
};
export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
export const alphaForDecay = (days: number) => 1 - 2 ** (-1 / Math.max(1, days));
export function computeMetrics(tasks: MetricTask[], windowDays: number, now: number) {
  const done = tasks.filter(
    (task) =>
      task.workflowState === "DONE" &&
      task.doneAt !== null &&
      task.doneAt >= now - windowDays * DAY,
  );
  const lead = done
    .filter((task) => task.createdAt !== null)
    .map((task) => task.doneAt! - task.createdAt!);
  const due = done.filter((task) => task.dueDate !== null);
  return [
    done.length,
    median(lead),
    due.length ? due.filter((task) => task.doneAt! <= task.dueDate!).length / due.length : null,
  ] as const;
}
export function computeFlowState(leadTimeMs: number | null, wip: number, throughput: number) {
  if (leadTimeMs === null || leadTimeMs <= 0) return null;
  return Math.max(0, (throughput + 1) / (leadTimeMs / DAY + 1) - 0.1 * wip);
}
