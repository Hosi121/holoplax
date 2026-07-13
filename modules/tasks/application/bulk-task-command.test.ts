import { describe, expect, it } from "vitest";
import { planBulkStatusExecution } from "./bulk-task-command";

const task = (
  overrides: Partial<Parameters<typeof planBulkStatusExecution>[0]["tasks"][number]> = {},
) => ({
  id: "task-1",
  status: "BACKLOG" as const,
  workflowState: "READY" as const,
  type: "TASK" as const,
  checklist: null,
  dependencies: [],
  children: [],
  ...overrides,
});

describe("planBulkStatusExecution", () => {
  it("uses the shared lifecycle projection when a canceled task is committed", () => {
    expect(
      planBulkStatusExecution({
        requestedStatus: "SPRINT",
        tasks: [task({ workflowState: "CANCELED" })],
      }),
    ).toEqual({
      ok: true,
      requestedStatus: "SPRINT",
      requiresActiveSprint: true,
      tasks: [
        {
          taskId: "task-1",
          status: "SPRINT",
          workflowState: "READY",
          planningAction: "COMMIT",
          createNextRoutineOccurrence: false,
        },
      ],
    });
  });

  it("allows dependencies completed in the same bulk command", () => {
    const plan = planBulkStatusExecution({
      requestedStatus: "DONE",
      tasks: [
        task({ id: "dependent", dependencies: [{ id: "prerequisite", workflowState: "READY" }] }),
        task({ id: "prerequisite" }),
      ],
    });
    expect(plan.ok).toBe(true);
  });
});
