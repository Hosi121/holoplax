import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("../prisma", () => ({
  default: { task: { findMany: mocks.findMany, findFirst: mocks.findFirst } },
}));

import { getTask, listTasks } from "../../modules/tasks/infrastructure/prisma-task-query";

describe("task query boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(null);
  });

  it("normalizes non-finite pagination before it reaches Prisma", async () => {
    await listTasks("workspace-1", { limit: Number.NaN, page: Number.NaN });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace-1" },
        take: 201,
        skip: 0,
      }),
    );
  });

  it("uses integer, bounded pagination values", async () => {
    await listTasks("workspace-1", { limit: 12.9, page: 2.9 });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 13, skip: 24 }));
  });

  it("always scopes a task lookup to its workspace", async () => {
    await expect(getTask("workspace-1", "task-1")).resolves.toBeNull();

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "task-1", workspaceId: "workspace-1" } }),
    );
  });
});
