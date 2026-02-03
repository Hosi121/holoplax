import { PrismaClient } from "@prisma/client";
import type { ExecutionContext } from "../context.js";

const prisma = new PrismaClient();

// Type definitions matching Prisma schema
type TaskStatus = "BACKLOG" | "SPRINT" | "DONE";
type TaskType = "EPIC" | "PBI" | "TASK" | "ROUTINE";

const TASK_STATUS = {
  BACKLOG: "BACKLOG",
  SPRINT: "SPRINT",
  DONE: "DONE",
} as const;

const TASK_TYPE = {
  EPIC: "EPIC",
  PBI: "PBI",
  TASK: "TASK",
  ROUTINE: "ROUTINE",
} as const;

const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;

function deriveIntakeTitle(text: string): string {
  const firstLine = text.split("\n")[0] ?? text;
  return firstLine.slice(0, 80).trim() || "Untitled";
}

function diceCoefficient(a: string, b: string): number {
  const bigrams = (str: string): Set<string> => {
    const result = new Set<string>();
    const lower = str.toLowerCase();
    for (let i = 0; i < lower.length - 1; i++) {
      result.add(lower.slice(i, i + 2));
    }
    return result;
  };

  const set1 = bigrams(a);
  const set2 = bigrams(b);
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const bigram of set1) {
    if (set2.has(bigram)) intersection++;
  }

  return (2 * intersection) / (set1.size + set2.size);
}

interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
}

async function findDuplicateTasks(
  workspaceId: string,
  title: string,
  limit = 5,
): Promise<{ id: string; title: string; status: string; score: number }[]> {
  const tasks = (await prisma.task.findMany({
    where: { workspaceId, status: { not: TASK_STATUS.DONE } },
    select: { id: true, title: true, status: true },
    take: 200,
  })) as TaskSummary[];

  const scored = tasks
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      score: diceCoefficient(title, task.title),
    }))
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

export async function listIntake(ctx: ExecutionContext) {
  const { userId, workspaceId } = ctx;

  const [globalItems, workspaceItems] = await Promise.all([
    prisma.intakeItem.findMany({
      where: { userId, workspaceId: null, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.intakeItem.findMany({
      where: { workspaceId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    currentWorkspaceId: workspaceId,
    globalItems,
    workspaceItems,
  };
}

export interface CreateMemoInput {
  text: string;
}

export async function createMemo(ctx: ExecutionContext, input: CreateMemoInput) {
  const { userId, workspaceId } = ctx;

  if (!input.text?.trim()) {
    throw new Error("text is required");
  }

  const title = deriveIntakeTitle(input.text);

  const item = await prisma.intakeItem.create({
    data: {
      source: "MEMO",
      status: "PENDING",
      title,
      body: input.text,
      user: { connect: { id: userId } },
      workspace: { connect: { id: workspaceId } },
    },
  });

  const duplicates = await findDuplicateTasks(workspaceId, title);

  return { item, duplicates };
}

export interface ResolveIntakeInput {
  intakeId: string;
  action: "dismiss" | "merge" | "create";
  taskType?: string;
  targetTaskId?: string;
}

export async function resolveIntake(ctx: ExecutionContext, input: ResolveIntakeInput) {
  const { userId, workspaceId } = ctx;

  const intakeItem = await prisma.intakeItem.findFirst({
    where: { id: input.intakeId },
  });

  if (!intakeItem) {
    throw new Error("invalid intakeId");
  }

  if (intakeItem.userId !== userId && intakeItem.workspaceId !== workspaceId) {
    throw new Error("not allowed");
  }

  if (input.action === "dismiss") {
    await prisma.intakeItem.update({
      where: { id: input.intakeId },
      data: { status: "DISMISSED" },
    });
    return { status: "DISMISSED" };
  }

  if (input.action === "merge") {
    if (!input.targetTaskId) {
      throw new Error("targetTaskId is required for merge action");
    }

    const targetTask = await prisma.task.findFirst({
      where: { id: input.targetTaskId, workspaceId },
    });

    if (!targetTask) {
      throw new Error("invalid targetTaskId");
    }

    const appendix = `\n\n---\nInbox取り込み:\n${intakeItem.body}`;
    await prisma.task.update({
      where: { id: input.targetTaskId },
      data: {
        description: `${targetTask.description ?? ""}${appendix}`,
      },
    });

    await prisma.intakeItem.update({
      where: { id: input.intakeId },
      data: {
        status: "CONVERTED",
        workspaceId,
        taskId: input.targetTaskId,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "INTAKE_MERGE",
        targetWorkspaceId: workspaceId,
        metadata: { intakeId: input.intakeId, taskId: input.targetTaskId, source: "mcp" },
      },
    });

    return { taskId: input.targetTaskId };
  }

  if (input.action === "create") {
    const typeValue: TaskType = Object.values(TASK_TYPE).includes(input.taskType as TaskType)
      ? (input.taskType as TaskType)
      : TASK_TYPE.PBI;

    const task = await prisma.task.create({
      data: {
        title: intakeItem.title,
        description: intakeItem.body,
        points: 3,
        urgency: SEVERITY.MEDIUM,
        risk: SEVERITY.MEDIUM,
        status: TASK_STATUS.BACKLOG,
        type: typeValue,
        user: { connect: { id: userId } },
        workspace: { connect: { id: workspaceId } },
      },
    });

    await prisma.intakeItem.update({
      where: { id: input.intakeId },
      data: {
        status: "CONVERTED",
        workspaceId,
        taskId: task.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "INTAKE_CREATE",
        targetWorkspaceId: workspaceId,
        metadata: { intakeId: input.intakeId, taskId: task.id, source: "mcp" },
      },
    });

    return { taskId: task.id };
  }

  throw new Error("invalid action");
}
