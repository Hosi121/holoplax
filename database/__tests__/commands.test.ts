import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "../test-runtime";

let runtime: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  runtime = await createTestDatabase();
});
afterEach(async () => {
  await runtime?.dispose();
});
async function seed() {
  const user = await runtime.db.user.create({ data: { email: "db@example.test", name: "Test" } });
  const workspace = await runtime.db.workspace.create({ data: { name: "Test", ownerId: user.id } });
  return { user, workspace };
}
describe("native D1 commands", () => {
  test("creates defaults and reads pending writes and relations before committing", async () => {
    const { user, workspace } = await seed();
    const result = await runtime.db.command(async (tx) => {
      const task = await tx.task.create({
        data: { title: "One", points: 3, workspaceId: workspace.id, userId: user.id },
      });
      await tx.task.update({ where: { id: task.id }, data: { workflowState: "DONE" } });
      return tx.task.findUniqueOrThrow({
        where: { id: task.id },
        include: { workspace: { select: { name: true } } },
      });
    });
    expect(result).toMatchObject({
      title: "One",
      workflowState: "DONE",
      tags: [],
      workspace: { name: "Test" },
    });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(await runtime.db.task.count()).toBe(1);
  });
  test("a late foreign key failure rolls back tasks, history and revisions", async () => {
    const { workspace } = await seed();
    await expect(
      runtime.db.command(async (tx) => {
        await tx.task.create({ data: { title: "Partial", points: 3, workspaceId: workspace.id } });
        await tx.workspaceMember.create({ data: { userId: "missing", workspaceId: workspace.id } });
      }),
    ).rejects.toThrow();
    expect(await runtime.db.task.count()).toBe(0);
    const guard = await runtime.binding
      .prepare('SELECT COUNT(*) AS n FROM "_CommandGuard"')
      .first<{ n: number }>();
    expect(guard?.n).toBe(0);
  });
  test("two capacity decisions cannot commit against the same snapshot", async () => {
    const { workspace } = await seed();
    const sprint = await runtime.db.sprint.create({
      data: { name: "Sprint", capacityPoints: 5, workspaceId: workspace.id },
    });
    const tasks = await Promise.all(
      ["A", "B"].map((title) =>
        runtime.db.task.create({ data: { title, points: 3, workspaceId: workspace.id } }),
      ),
    );
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const commits = tasks.map((task) =>
      runtime.db.command(async (tx) => {
        const total = await tx.sprintItem.aggregate({
          where: { sprintId: sprint.id },
          _sum: { committedPoints: true },
        });
        if ((total._sum.committedPoints ?? 0) + task.points > 5)
          throw new Error("capacity exceeded");
        if (++arrived <= 2) {
          if (arrived === 2) release();
          await barrier;
        }
        await tx.sprintItem.create({
          data: {
            sprintId: sprint.id,
            taskId: task.id,
            taskKey: task.id,
            taskTitle: task.title,
            taskType: task.type,
            committedPoints: task.points,
          },
        });
      }),
    );
    const results = await Promise.allSettled(commits);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await runtime.db.sprintItem.count()).toBe(1);
  });
  test("enforces workspace dependencies, active sprint and memory scope constraints", async () => {
    const { user, workspace } = await seed();
    const other = await runtime.db.workspace.create({ data: { name: "Other", ownerId: user.id } });
    const a = await runtime.db.task.create({
      data: { title: "A", points: 3, workspaceId: workspace.id },
    });
    const b = await runtime.db.task.create({
      data: { title: "B", points: 3, workspaceId: other.id },
    });
    await expect(
      runtime.db.taskDependency.create({
        data: { taskId: a.id, dependsOnId: b.id, workspaceId: workspace.id },
      }),
    ).rejects.toThrow();
    await runtime.db.sprint.create({
      data: { name: "One", capacityPoints: 5, workspaceId: workspace.id },
    });
    await expect(
      runtime.db.sprint.create({
        data: { name: "Two", capacityPoints: 5, workspaceId: workspace.id },
      }),
    ).rejects.toThrow();
    const definition = await runtime.db.memoryDefinition.create({
      data: {
        key: "test",
        scope: "USER",
        valueType: "NUMBER",
        granularity: "day",
        updatePolicy: "manual",
      },
    });
    await expect(
      runtime.db.memoryClaim.create({
        data: { definitionId: definition.id, userId: user.id, workspaceId: workspace.id },
      }),
    ).rejects.toThrow();
  });
});

test("binds long search text and large ID lists while preserving case and literal wildcards", async () => {
  const { workspace } = await seed();
  const text = "x".repeat(100) + "Mixed_%'";
  const task = await runtime.db.task.create({
    data: { title: text, points: 3, workspaceId: workspace.id, tags: ["kept"] },
  });
  const ids = Array.from({ length: 200 }, (_, index) => `missing-${index}`).concat(task.id);
  expect(
    await runtime.db.task.count({ where: { id: { in: ids }, title: { contains: text } } }),
  ).toBe(1);
  expect(await runtime.db.task.count({ where: { title: { contains: "mixed_%'" } } })).toBe(0);
  expect(
    await runtime.db.task.count({
      where: { title: { contains: "mixed_%'", mode: "insensitive" } },
    }),
  ).toBe(1);
  expect(await runtime.db.task.count({ where: { title: { contains: "_%'" } } })).toBe(1);
  expect(
    await runtime.db.task.count({
      where: {
        tags: { hasSome: Array.from({ length: 200 }, (_, index) => `tag-${index}`).concat("kept") },
      },
    }),
  ).toBe(1);
});
