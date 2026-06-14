import { describe, expect, it, vi } from "vitest";
import { checkSprintCapacity, findActiveSprint, sumSprintPoints } from "../tasks/sprint-capacity";

// Minimal fake of the Prisma delegates the helpers touch.
const makeClient = (opts: {
  activeSprint?: { id: string; capacityPoints: number } | null;
  committed?: number;
}) => {
  const sprintFindFirst = vi.fn().mockResolvedValue(opts.activeSprint ?? null);
  const taskAggregate = vi.fn().mockResolvedValue({ _sum: { points: opts.committed ?? 0 } });
  // Structural stand-in for the Prisma transaction client the helpers touch.
  const client = {
    sprint: { findFirst: sprintFindFirst },
    task: { aggregate: taskAggregate },
  } as unknown as Parameters<typeof checkSprintCapacity>[0];
  return { client, sprintFindFirst, taskAggregate };
};

describe("findActiveSprint", () => {
  it("queries the most recently started ACTIVE sprint", async () => {
    const { client, sprintFindFirst } = makeClient({
      activeSprint: { id: "s1", capacityPoints: 20 },
    });
    const sprint = await findActiveSprint(client, "ws1");
    expect(sprint).toEqual({ id: "s1", capacityPoints: 20 });
    expect(sprintFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      select: { id: true, capacityPoints: true },
    });
  });
});

describe("sumSprintPoints", () => {
  it("returns 0 when no points are committed", async () => {
    const { client } = makeClient({ committed: 0 });
    expect(await sumSprintPoints(client, "ws1")).toBe(0);
  });

  it("excludes the given task ids from the aggregate", async () => {
    const { client, taskAggregate } = makeClient({ committed: 8 });
    expect(await sumSprintPoints(client, "ws1", ["a", "b"])).toBe(8);
    expect(taskAggregate).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", status: "SPRINT", id: { notIn: ["a", "b"] } },
      _sum: { points: true },
    });
  });

  it("omits the id filter when the exclude list is empty", async () => {
    const { client, taskAggregate } = makeClient({ committed: 3 });
    await sumSprintPoints(client, "ws1", []);
    expect(taskAggregate).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", status: "SPRINT" },
      _sum: { points: true },
    });
  });
});

describe("checkSprintCapacity", () => {
  it("is a no-op when there is no active sprint", async () => {
    const { client, taskAggregate } = makeClient({ activeSprint: null });
    const result = await checkSprintCapacity(client, { workspaceId: "ws1", additionalPoints: 99 });
    expect(result).toEqual({
      activeSprint: null,
      committedPoints: 0,
      nextTotal: 0,
      exceeded: false,
    });
    // No need to sum points when there is no sprint to fill.
    expect(taskAggregate).not.toHaveBeenCalled();
  });

  it("does not flag a fit that exactly hits capacity", async () => {
    const { client } = makeClient({
      activeSprint: { id: "s1", capacityPoints: 20 },
      committed: 12,
    });
    const result = await checkSprintCapacity(client, { workspaceId: "ws1", additionalPoints: 8 });
    expect(result.nextTotal).toBe(20);
    expect(result.exceeded).toBe(false);
  });

  it("flags going over capacity", async () => {
    const { client } = makeClient({
      activeSprint: { id: "s1", capacityPoints: 20 },
      committed: 18,
    });
    const result = await checkSprintCapacity(client, { workspaceId: "ws1", additionalPoints: 5 });
    expect(result.nextTotal).toBe(23);
    expect(result.exceeded).toBe(true);
  });

  it("reuses a pre-fetched active sprint instead of querying", async () => {
    const { client, sprintFindFirst } = makeClient({ committed: 4 });
    const result = await checkSprintCapacity(client, {
      workspaceId: "ws1",
      additionalPoints: 2,
      activeSprint: { id: "pre", capacityPoints: 10 },
    });
    expect(sprintFindFirst).not.toHaveBeenCalled();
    expect(result.activeSprint).toEqual({ id: "pre", capacityPoints: 10 });
    expect(result.nextTotal).toBe(6);
    expect(result.exceeded).toBe(false);
  });
});
