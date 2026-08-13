import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260813001000_prepare_task_automation_state_removal/migration.sql",
  ),
  "utf8",
);

describe("Task automation state projection removal migration", () => {
  it("refuses to carry divergent automation projections forward", () => {
    expect(sql).toContain("Task contains divergent automation projections");
    expect(sql).toContain(`WHEN "hierarchyRole" = 'SPLIT_PARENT' THEN 'SPLIT_PARENT'`);
    expect(sql).toContain(`WHEN "automationStatus" = 'PREPARED' THEN 'DELEGATED'`);
  });

  it("keeps the rollout-only column synchronized without exposing it to Prisma", () => {
    expect(sql).toContain('CREATE TRIGGER "Task_sync_legacy_automation_state"');
    expect(sql).not.toContain('DROP COLUMN "automationState"');
  });
});
