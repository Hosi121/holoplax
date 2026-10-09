import bcrypt from "bcryptjs";
import { afterEach, beforeEach, expect, test } from "vitest";
import { d1AiOperationsPort } from "../../modules/ai/infrastructure/d1-ai-operations";
import { d1DelegationQueuePort } from "../../modules/delegation/infrastructure/d1-delegation-queue";
import { d1IdentityPort } from "../../modules/identity/infrastructure/d1-identity";
import { d1CompleteOnboardingCommandPort } from "../../modules/onboarding/infrastructure/d1-complete-onboarding-command";
import { persistNewTask } from "../../modules/tasks/infrastructure/d1-task-writer";
import { withRuntime } from "../../server/runtime";
import { createTestDatabase, testEvent } from "../test-runtime";

let runtime: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  runtime = await createTestDatabase();
});
afterEach(async () => {
  await runtime.dispose();
});
const run = <T>(operation: () => Promise<T>) => {
  const { env, execution } = testEvent(runtime.binding);
  return withRuntime(env, execution, operation);
};
async function seed() {
  const user = await runtime.db.user.create({ data: { email: "feature@example.test" } });
  const workspace = await runtime.db.workspace.create({
    data: { name: "Feature", ownerId: user.id },
  });
  return { user, workspace };
}
test("registration and repeat onboarding atomically persist passwords and owner membership", async () =>
  run(async () => {
    const user = await d1IdentityPort.register({
      email: "new@example.test",
      password: "password-1234",
    });
    const password = await runtime.db.userPassword.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(await bcrypt.compare("password-1234", password.hash)).toBe(true);
    const result = await d1CompleteOnboardingCommandPort.execute(user.id, { workspaceName: "New" });
    expect(result.created).toBe(true);
    if (!result.created) throw new Error("Expected new workspace");
    expect(
      await runtime.db.workspaceMember.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId: result.workspaceId, userId: user.id } },
      }),
    ).toMatchObject({ role: "owner" });
    expect(
      (await d1CompleteOnboardingCommandPort.execute(user.id, { workspaceName: "Duplicate" }))
        .created,
    ).toBe(false);
    expect(await runtime.db.workspace.count()).toBe(1);
    await expect(
      d1IdentityPort.register({ email: "new@example.test", password: "other-password" }),
    ).rejects.toThrow("email already registered");
    expect(await runtime.db.userPassword.count()).toBe(1);
  }));
test("routine rules and dependencies share a commit, and deleting a task retains immutable history", async () => {
  const { user, workspace } = await seed();
  const prerequisite = await runtime.db.task.create({
    data: { title: "Prerequisite", points: 3, workspaceId: workspace.id },
  });
  const task = await runtime.db.command((tx) =>
    persistNewTask(
      tx,
      {
        title: "Routine",
        points: 3,
        type: "TASK",
        urgency: "LOW",
        risk: "LOW",
        status: "BACKLOG",
        userId: user.id,
        workspaceId: workspace.id,
        dependencyIds: [prerequisite.id],
        routineRule: { cadence: "DAILY", nextAt: new Date(Date.now() + 86_400_000) },
      },
      { actorId: user.id, trigger: "API" },
    ),
  );
  expect(await runtime.db.routineRule.count({ where: { taskId: task.id } })).toBe(1);
  expect(await runtime.db.taskDependency.count({ where: { taskId: task.id } })).toBe(1);
  await runtime.db.task.delete({ where: { id: task.id } });
  expect(await runtime.db.routineRule.count()).toBe(0);
  expect(await runtime.db.taskStatusEvent.findFirst({ where: { taskKey: task.id } })).toMatchObject(
    { taskId: null, taskTitle: "Routine" },
  );
  expect(
    await runtime.db.taskDependencyEvent.findFirst({ where: { taskKey: task.id } }),
  ).toMatchObject({ taskId: null, dependsOnKey: prerequisite.id });
  expect(
    await runtime.db.taskWorkflowEvent.findFirst({ where: { taskKey: task.id } }),
  ).toMatchObject({ taskId: null, taskPoints: 3, taskCreatorId: user.id });
  const columns = await runtime.db.query<{ name: string }>('PRAGMA table_info("Task")');
  expect(columns.map((column) => column.name)).not.toContain("status");
  expect(columns.map((column) => column.name)).not.toContain("automationState");
});
test("reaction learning records evidence without overwriting an EXPLICIT memory claim", async () =>
  run(async () => {
    const { user, workspace } = await seed();
    const suggestion = await runtime.db.aiSuggestion.create({
      data: {
        type: "TIP",
        inputTitle: "Tip",
        inputDescription: "",
        output: "Tip",
        userId: user.id,
        workspaceId: workspace.id,
      },
    });
    const definition = await runtime.db.memoryDefinition.create({
      data: {
        key: "ai_tip_accept_rate_30d",
        scope: "USER",
        valueType: "NUMBER",
        granularity: "daily",
        updatePolicy: "derived",
      },
    });
    const claim = await runtime.db.memoryClaim.create({
      data: { userId: user.id, definitionId: definition.id, valueNum: 0.8, provenance: "EXPLICIT" },
    });
    await d1AiOperationsPort.recordReaction({
      userId: user.id,
      workspaceId: workspace.id,
      suggestionId: suggestion.id,
      reaction: "REJECTED",
    });
    expect(await runtime.db.memoryClaim.findUniqueOrThrow({ where: { id: claim.id } })).toEqual(
      claim,
    );
    expect(await runtime.db.aiSuggestionReaction.count()).toBe(1);
  }));
test("only one queue consumer claims a job, and cancellation wins over a late completion", async () =>
  run(async () => {
    const { user, workspace } = await seed();
    const job = await runtime.db.delegationJob.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        request: "Draft",
        mode: "PREPARE",
        kind: "WRITING",
        risk: "LOW",
        plan: {},
      },
    });
    const claims = await Promise.all([
      d1DelegationQueuePort.claimNext("a"),
      d1DelegationQueuePort.claimNext("b"),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claimed = await runtime.db.delegationJob.findUniqueOrThrow({ where: { id: job.id } });
    await runtime.db.delegationJob.update({
      where: { id: job.id },
      data: { status: "CANCELED", lockedAt: null, lockedBy: null },
    });
    const finished = await d1DelegationQueuePort.complete(job.id, claimed.lockedBy!, "Late", {
      passed: true,
      summary: "OK",
      issues: [],
      method: "basic",
    });
    expect(finished).toBe(false);
    expect(
      await runtime.db.delegationJob.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({ status: "CANCELED", result: null });
  }));
