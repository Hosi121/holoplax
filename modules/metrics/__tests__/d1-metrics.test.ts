import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDatabase } from "../../../database/test-runtime";
import { runMetricScope } from "../infrastructure/d1-metrics";

let runtime: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  runtime = await createTestDatabase();
});
afterEach(async () => {
  await runtime.dispose();
});
test("keeps deleted task history, explicit claims, and repeated daily deliveries", async () => {
  const db = runtime.db,
    day = 86_400_000,
    now = Date.UTC(2026, 9, 9);
  const user = await db.user.create({ data: { email: "metrics@example.test" } });
  const workspace = await db.workspace.create({ data: { name: "Metrics", ownerId: user.id } });
  const task = await db.task.create({
    data: {
      title: "Historical",
      points: 3,
      userId: user.id,
      workspaceId: workspace.id,
      createdAt: new Date(now - 3 * day),
    },
  });
  for (const [state, offset] of [
    ["READY", -3],
    ["IN_PROGRESS", -2],
    ["DONE", -1],
  ] as const)
    await db.taskWorkflowEvent.create({
      data: {
        taskId: task.id,
        taskKey: task.id,
        taskCreatedAt: task.createdAt,
        taskDueDate: new Date(now - day),
        taskPoints: 3,
        taskCreatorId: user.id,
        toState: state,
        workspaceId: workspace.id,
        createdAt: new Date(now + offset * day),
      },
    });
  const definition = await db.memoryDefinition.create({
    data: {
      key: "throughput_14d",
      scope: "WORKSPACE",
      valueType: "NUMBER",
      granularity: "daily",
      updatePolicy: "derived",
    },
  });
  const explicit = await db.memoryClaim.create({
    data: {
      definitionId: definition.id,
      workspaceId: workspace.id,
      valueNum: 99,
      provenance: "EXPLICIT",
    },
  });
  await db.task.delete({ where: { id: task.id } });
  await runMetricScope("WORKSPACE", workspace.id, now, db);
  const metrics = await db.memoryMetric.findMany({
    where: { workspaceId: workspace.id },
    include: { definition: { select: { key: true } } },
  });
  const values = Object.fromEntries(
    metrics.map((metric) => [metric.definition.key, metric.valueNum]),
  );
  expect(values).toMatchObject({
    throughput_14d: 1,
    lead_time_median_30d: 2 * day,
    deadline_adherence_30d: 1,
  });
  expect(values.wip_avg_14d).toBeCloseTo(1 / 14, 14);
  const claim = await db.memoryClaim.findUniqueOrThrow({ where: { id: explicit.id } });
  expect(claim.valueNum).toBe(99);
  const before = await db.memoryClaim.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { id: "asc" },
  });
  await runMetricScope("WORKSPACE", workspace.id, now, db);
  expect(await db.memoryMetric.count({ where: { workspaceId: workspace.id } })).toBe(
    metrics.length,
  );
  expect(
    await db.memoryClaim.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: "asc" } }),
  ).toEqual(before);
});
