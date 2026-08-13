import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260813000000_prepare_task_status_projection_removal/migration.sql",
  ),
  "utf8",
);

describe("Task status projection removal migration", () => {
  it("refuses to carry a divergent compatibility projection forward", () => {
    expect(sql).toContain("Task contains divergent status/workflow/sprint projections");
    expect(sql).toContain(`WHEN task."workflowState" = 'DONE' THEN 'DONE'`);
    expect(sql).toContain(`WHEN sprint.status = 'ACTIVE' THEN 'SPRINT'`);
  });

  it("indexes canonical state and synchronizes the rollout-only compatibility column", () => {
    expect(sql).toContain('"Task_workspaceId_workflowState_createdAt_id_idx"');
    expect(sql).toContain('"Task_sprintId_workflowState_idx"');
    expect(sql).toContain('CREATE TRIGGER "Task_sync_legacy_status"');
    expect(sql).not.toContain('DROP COLUMN "status"');
  });
});
