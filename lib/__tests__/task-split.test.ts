import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../../modules/shared/application/application-error";
import { splitTaskIntoChildren } from "../../modules/tasks/infrastructure/prisma-task-split";

const createTx = (options: {
  claimed?: number;
  activeSprint?: { id: string; capacityPoints: number } | null;
  committedPoints?: number;
  parentStatus?: "BACKLOG" | "SPRINT";
  parentType?: "EPIC" | "PBI" | "TASK";
}) => {
  const create = vi.fn().mockResolvedValue({
    id: "child",
    title: "Child",
    type: "TASK",
    points: 3,
    createdAt: new Date(),
    dueDate: null,
    userId: "user",
  });
  const tx = {
    task: {
      findFirst: vi.fn().mockResolvedValue({
        title: "Parent",
        workflowState: "READY",
        sprintId: options.parentStatus === "SPRINT" ? "sprint" : null,
        sprint: options.parentStatus === "SPRINT" ? { status: "ACTIVE" } : null,
        type: options.parentType ?? "PBI",
      }),
      updateMany: vi.fn().mockResolvedValue({ count: options.claimed ?? 1 }),
      create,
      findUnique: vi.fn().mockResolvedValue({
        createdAt: new Date(),
        dueDate: null,
        points: 3,
        userId: "user",
      }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { points: options.committedPoints ?? 0 } }),
    },
    sprint: {
      findFirst: vi.fn().mockResolvedValue(options.activeSprint ?? null),
    },
    taskStatusEvent: { create: vi.fn().mockResolvedValue({ id: "event" }) },
    taskWorkflowEvent: { create: vi.fn().mockResolvedValue({ id: "workflow-event" }) },
    sprintItem: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: "sprint-item",
        taskTitle: "Child",
        taskType: "TASK",
        committedPoints: 3,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { committedPoints: options.committedPoints ?? 0 } }),
    },
    sprintItemEvent: {
      create: vi.fn().mockResolvedValue({ id: "sprint-event" }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, create };
};

const baseParams = {
  taskId: "parent",
  workspaceId: "workspace",
  userId: "user",
  expectedStatuses: ["SPLIT_PENDING" as const],
};

describe("splitTaskIntoChildren", () => {
  it("creates normalized backlog children with initial status events", async () => {
    const { tx, create } = createTx({});
    const result = await splitTaskIntoChildren(tx, {
      ...baseParams,
      status: "BACKLOG",
      suggestions: [{ title: "Child", detail: "Detail", points: 4 }],
    });

    expect(result).toEqual({ applied: true, created: 1, sprintId: null });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Child",
        points: 3,
        workflowState: "READY",
        parentId: "parent",
        automationState: "SPLIT_CHILD",
      }),
    });
    expect(tx.taskStatusEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: "child",
        taskKey: "child",
        taskTitle: "Child",
        toStatus: "BACKLOG",
        actorId: "user",
      }),
    });
  });

  it("does not create children when another request already claimed the parent", async () => {
    const { tx, create } = createTx({ claimed: 0 });
    const result = await splitTaskIntoChildren(tx, {
      ...baseParams,
      status: "BACKLOG",
      suggestions: [{ title: "Child", points: 3 }],
    });

    expect(result.applied).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("preserves the work-breakdown levels when an epic is split", async () => {
    const { tx, create } = createTx({ parentType: "EPIC" });
    await splitTaskIntoChildren(tx, {
      ...baseParams,
      status: "BACKLOG",
      suggestions: [{ title: "PBI", points: 3 }],
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "PBI", parentId: "parent" }),
    });
  });

  it("enforces active sprint capacity before creating children", async () => {
    const { tx, create } = createTx({
      activeSprint: { id: "sprint", capacityPoints: 10 },
      committedPoints: 8,
    });

    await expect(
      splitTaskIntoChildren(tx, {
        ...baseParams,
        status: "SPRINT",
        suggestions: [{ title: "Child", points: 3 }],
      }),
    ).rejects.toEqual(expect.any(ApplicationError));
    expect(create).not.toHaveBeenCalled();
  });

  it("replaces a committed parent instead of double-counting it with sprint children", async () => {
    const { tx, create } = createTx({
      parentStatus: "SPRINT",
      activeSprint: { id: "sprint", capacityPoints: 10 },
      committedPoints: 4,
    });

    await expect(
      splitTaskIntoChildren(tx, {
        ...baseParams,
        status: "SPRINT",
        suggestions: [
          { title: "Child A", points: 3 },
          { title: "Child B", points: 3 },
        ],
      }),
    ).resolves.toMatchObject({ applied: true, created: 2, sprintId: "sprint" });

    expect(tx.sprintItem.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ taskKey: { notIn: ["parent"] } }),
      }),
    );
    expect(tx.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sprintId: null }),
      }),
    );
    expect(create).toHaveBeenCalledTimes(2);
  });
});
