-- Preserve immutable audit history and enforce temporal/scope/tenant rules
-- that cannot be represented completely by nullable application types.
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";
ALTER TABLE "AuditLog" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Sprint"
    WHERE "plannedEndAt" IS NOT NULL AND "plannedEndAt" < "startedAt"
  ) THEN
    RAISE EXCEPTION 'Sprint contains plannedEndAt before startedAt';
  END IF;
  IF EXISTS (SELECT 1 FROM "MemoryClaim" WHERE num_nonnulls("userId", "workspaceId") <> 1) THEN
    RAISE EXCEPTION 'MemoryClaim contains an invalid owner scope';
  END IF;
  IF EXISTS (SELECT 1 FROM "MemoryQuestion" WHERE num_nonnulls("userId", "workspaceId") <> 1) THEN
    RAISE EXCEPTION 'MemoryQuestion contains an invalid owner scope';
  END IF;
  IF EXISTS (SELECT 1 FROM "MemoryMetric" WHERE num_nonnulls("userId", "workspaceId") <> 1) THEN
    RAISE EXCEPTION 'MemoryMetric contains an invalid owner scope';
  END IF;
  IF EXISTS (SELECT 1 FROM "TaskDependency" WHERE "taskId" = "dependsOnId") THEN
    RAISE EXCEPTION 'TaskDependency contains a self dependency';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "TaskDependency" dependency
    JOIN "Task" task ON task.id = dependency."taskId"
    JOIN "Task" prerequisite ON prerequisite.id = dependency."dependsOnId"
    WHERE task."workspaceId" <> prerequisite."workspaceId"
  ) THEN
    RAISE EXCEPTION 'TaskDependency contains a cross-workspace edge';
  END IF;
END $$;

ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_planned_window_check"
  CHECK ("plannedEndAt" IS NULL OR "plannedEndAt" >= "startedAt") NOT VALID;
ALTER TABLE "Sprint" VALIDATE CONSTRAINT "Sprint_planned_window_check";

ALTER TABLE "MemoryClaim" ADD CONSTRAINT "MemoryClaim_owner_scope_check"
  CHECK (num_nonnulls("userId", "workspaceId") = 1) NOT VALID;
ALTER TABLE "MemoryClaim" VALIDATE CONSTRAINT "MemoryClaim_owner_scope_check";
ALTER TABLE "MemoryQuestion" ADD CONSTRAINT "MemoryQuestion_owner_scope_check"
  CHECK (num_nonnulls("userId", "workspaceId") = 1) NOT VALID;
ALTER TABLE "MemoryQuestion" VALIDATE CONSTRAINT "MemoryQuestion_owner_scope_check";
ALTER TABLE "MemoryMetric" ADD CONSTRAINT "MemoryMetric_owner_scope_check"
  CHECK (num_nonnulls("userId", "workspaceId") = 1) NOT VALID;
ALTER TABLE "MemoryMetric" VALIDATE CONSTRAINT "MemoryMetric_owner_scope_check";

CREATE UNIQUE INDEX "Task_id_workspaceId_key" ON "Task"("id", "workspaceId");
ALTER TABLE "TaskDependency" ADD COLUMN "workspaceId" TEXT;
UPDATE "TaskDependency" dependency
SET "workspaceId" = task."workspaceId"
FROM "Task" task
WHERE task.id = dependency."taskId";
ALTER TABLE "TaskDependency" ALTER COLUMN "workspaceId" SET NOT NULL;

ALTER TABLE "TaskDependency" DROP CONSTRAINT "TaskDependency_taskId_fkey";
ALTER TABLE "TaskDependency" DROP CONSTRAINT "TaskDependency_dependsOnId_fkey";
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_workspaceId_fkey"
  FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnId_workspaceId_fkey"
  FOREIGN KEY ("dependsOnId", "workspaceId") REFERENCES "Task"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_no_self_check"
  CHECK ("taskId" <> "dependsOnId") NOT VALID;
ALTER TABLE "TaskDependency" VALIDATE CONSTRAINT "TaskDependency_no_self_check";
CREATE INDEX "TaskDependency_workspaceId_state_idx"
  ON "TaskDependency"("workspaceId", state);
