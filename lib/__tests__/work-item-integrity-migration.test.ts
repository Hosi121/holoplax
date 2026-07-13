import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260713005000_enforce_scope_and_audit_integrity/migration.sql",
  ),
  "utf8",
);

describe("work item integrity migration", () => {
  it("preserves audit rows when their actor is deleted", () => {
    expect(sql).toContain('ALTER TABLE "AuditLog" ALTER COLUMN "actorId" DROP NOT NULL');
    expect(sql).toContain("ON DELETE SET NULL ON UPDATE CASCADE");
  });

  it("validates scope, sprint windows, and dependency tenants before constraining them", () => {
    expect(sql).toContain('num_nonnulls("userId", "workspaceId") <> 1');
    expect(sql).toContain('task."workspaceId" <> prerequisite."workspaceId"');
    expect(sql).toContain('CHECK ("taskId" <> "dependsOnId")');
    expect(sql).toContain('"plannedEndAt" >= "startedAt"');
  });
});
