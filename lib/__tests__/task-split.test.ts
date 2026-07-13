import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../../modules/shared/application/application-error";
import { splitTaskIntoChildren } from "../../modules/tasks/infrastructure/prisma-task-split";

const createTx = (options: {
  claimed?: number;
  activeSprint?: { id: string; capacityPoints: number } | null;
  committedPoints?: number;
}) => {
  const create = vi.fn().mockResolvedValue({ id: "child" });
  const tx = {
    task: {
      updateMany: vi.fn().mockResolvedValue({ count: options.claimed ?? 1 }),
      create,
      aggregate: vi.fn().mockResolvedValue({ _sum: { points: options.committedPoints ?? 0 } }),
    },
    sprint: {
      findFirst: vi.fn().mockResolvedValue(options.activeSprint ?? null),
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, create };
};

const baseParams = {
  taskId: "parent",
  workspaceId: "workspace",
  userId: "user",
  expectedStates: ["PENDING_SPLIT" as const],
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
        status: "BACKLOG",
        parentId: "parent",
        automationState: "SPLIT_CHILD",
        statusEvents: {
          create: expect.objectContaining({ toStatus: "BACKLOG", actorId: "user" }),
        },
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
});
