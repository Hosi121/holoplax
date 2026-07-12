import { describe, expect, it } from "vitest";
import {
  createTaskSchema,
  listTasksSchema,
  updateTaskSchema,
} from "../../mcp-server/src/tools/tasks";

describe("MCP task contracts", () => {
  it("uses the current work-breakdown task types", () => {
    expect(createTaskSchema.safeParse({ title: "x", points: 3, type: "TASK" }).success).toBe(true);
    expect(createTaskSchema.safeParse({ title: "x", points: 3, type: "ROUTINE" }).success).toBe(
      false,
    );
  });

  it("models recurrence independently from task type", () => {
    expect(
      createTaskSchema.safeParse({
        title: "daily review",
        points: 1,
        type: "TASK",
        routineCadence: "DAILY",
        routineNextAt: "2026-07-13T00:00:00Z",
      }).success,
    ).toBe(true);
    expect(updateTaskSchema.safeParse({ taskId: "task-1", routineCadence: null }).success).toBe(
      true,
    );
  });

  it("rejects invalid date filters and due dates", () => {
    expect(listTasksSchema.safeParse({ dueBefore: "not-a-date" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "x", points: 3, dueDate: "nope" }).success).toBe(
      false,
    );
  });
});
