import { describe, expect, it } from "vitest";
import { optimizeSprint } from "../sprint-optimizer";
import type { TaskDTO } from "../types";

const task = (id: string, points: TaskDTO["points"], dependencyIds: string[] = []): TaskDTO => ({
  id,
  title: id,
  description: "",
  points,
  urgency: "MEDIUM",
  risk: "MEDIUM",
  status: "BACKLOG",
  type: "PBI",
  dependencies: dependencyIds.map((dependencyId) => ({
    id: dependencyId,
    title: dependencyId,
    status: "BACKLOG",
  })),
});

describe("optimizeSprint", () => {
  it("selects a complete transitive dependency closure in dependency-first order", () => {
    const a = task("a", 1);
    const b = task("b", 2, ["a"]);
    const c = task("c", 3, ["b"]);
    const result = optimizeSprint([c, b, a], 6);
    expect(result.selectedTasks.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(result.totalPoints).toBe(6);
  });

  it("does not double-count a shared dependency", () => {
    const shared = task("shared", 2);
    const a = task("a", 3, ["shared"]);
    const b = task("b", 3, ["shared"]);
    const result = optimizeSprint([a, b, shared], 8);
    expect(result.selectedTasks.filter((item) => item.id === "shared")).toHaveLength(1);
    expect(result.totalPoints).toBe(8);
  });

  it("rejects cyclic dependency bundles", () => {
    const a = task("a", 2, ["b"]);
    const b = task("b", 2, ["a"]);
    const result = optimizeSprint([a, b], 10);
    expect(result.selectedTasks).toHaveLength(0);
    expect(result.excludedTasks.every((item) => item.reason.includes("循環"))).toBe(true);
  });

  it("rejects a root when its dependency bundle exceeds capacity", () => {
    const dependency = task("dependency", 5);
    const root = task("root", 5, ["dependency"]);
    const result = optimizeSprint([root, dependency], 5);
    expect(result.selectedTasks.map((item) => item.id)).toEqual(["dependency"]);
    expect(result.excludedTasks.find((item) => item.task.id === "root")?.reason).toContain(
      "キャパ超過",
    );
  });
});
