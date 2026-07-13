-- Keep compatibility activity after task deletion, make dependency decisions
-- append-only, and align the declared owner lifecycle with the live FK.
CREATE TYPE "TaskDependencyEventType" AS ENUM ('REQUIRED', 'WAIVED');

ALTER TABLE "TaskStatusEvent"
  ADD COLUMN "taskKey" TEXT,
  ADD COLUMN "taskTitle" TEXT;

UPDATE "TaskStatusEvent" event
SET "taskKey" = task.id,
    "taskTitle" = task.title
FROM "Task" task
WHERE task.id = event."taskId";

ALTER TABLE "TaskStatusEvent"
  ALTER COLUMN "taskId" DROP NOT NULL,
  ALTER COLUMN "taskKey" SET NOT NULL,
  ALTER COLUMN "taskTitle" SET NOT NULL;

ALTER TABLE "TaskStatusEvent" DROP CONSTRAINT "TaskStatusEvent_taskId_fkey";
ALTER TABLE "TaskStatusEvent" ADD CONSTRAINT "TaskStatusEvent_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "TaskStatusEvent_taskKey_createdAt_idx"
  ON "TaskStatusEvent"("taskKey", "createdAt");

CREATE TABLE "TaskDependencyEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT,
  "taskKey" TEXT NOT NULL,
  "dependsOnId" TEXT,
  "dependsOnKey" TEXT NOT NULL,
  "type" "TaskDependencyEventType" NOT NULL,
  "actorId" TEXT,
  "workspaceId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskDependencyEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TaskDependencyEvent" (
  "id", "taskId", "taskKey", "dependsOnId", "dependsOnKey",
  "type", "workspaceId", "reason", "createdAt"
)
SELECT
  CONCAT('dependency_event_initial_', dependency."taskId", '_', dependency."dependsOnId"),
  dependency."taskId", dependency."taskId",
  dependency."dependsOnId", dependency."dependsOnId",
  dependency.state::text::"TaskDependencyEventType",
  task."workspaceId", 'MIGRATION_BACKFILL', task."createdAt"
FROM "TaskDependency" dependency
JOIN "Task" task ON task.id = dependency."taskId";

CREATE INDEX "TaskDependencyEvent_taskKey_createdAt_idx"
  ON "TaskDependencyEvent"("taskKey", "createdAt");
CREATE INDEX "TaskDependencyEvent_dependsOnKey_createdAt_idx"
  ON "TaskDependencyEvent"("dependsOnKey", "createdAt");
CREATE INDEX "TaskDependencyEvent_workspaceId_createdAt_idx"
  ON "TaskDependencyEvent"("workspaceId", "createdAt");

ALTER TABLE "TaskDependencyEvent" ADD CONSTRAINT "TaskDependencyEvent_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskDependencyEvent" ADD CONSTRAINT "TaskDependencyEvent_dependsOnId_fkey"
  FOREIGN KEY ("dependsOnId") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskDependencyEvent" ADD CONSTRAINT "TaskDependencyEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskDependencyEvent" ADD CONSTRAINT "TaskDependencyEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_state_waivedAt_check"
  CHECK (
    (state = 'REQUIRED' AND "waivedAt" IS NULL) OR
    (state = 'WAIVED' AND "waivedAt" IS NOT NULL)
  ) NOT VALID;
ALTER TABLE "TaskDependency" VALIDATE CONSTRAINT "TaskDependency_state_waivedAt_check";

-- Lock metadata is part of the durable job state machine, not optional debug
-- data. Repair legacy rows before enforcing the state coupling.
UPDATE "TaskAutomationJob"
SET status = 'PENDING', "lockedAt" = NULL, "lockedBy" = NULL, "availableAt" = NOW()
WHERE status = 'RUNNING' AND ("lockedAt" IS NULL OR "lockedBy" IS NULL);
UPDATE "TaskAutomationJob"
SET "lockedAt" = NULL, "lockedBy" = NULL
WHERE status <> 'RUNNING';
ALTER TABLE "TaskAutomationJob" ADD CONSTRAINT "TaskAutomationJob_lock_state_check"
  CHECK (
    (status = 'RUNNING' AND "lockedAt" IS NOT NULL AND "lockedBy" IS NOT NULL) OR
    (status <> 'RUNNING' AND "lockedAt" IS NULL AND "lockedBy" IS NULL)
  ) NOT VALID;
ALTER TABLE "TaskAutomationJob" VALIDATE CONSTRAINT "TaskAutomationJob_lock_state_check";
