-- Preserve dependency waivers instead of deleting edges, make planning changes
-- auditable, and make task automation durable across process restarts.
CREATE TYPE "TaskDependencyState" AS ENUM ('REQUIRED', 'WAIVED');
CREATE TYPE "SprintItemEventType" AS ENUM (
  'COMMITTED', 'RECOMMITTED', 'COMPLETED', 'REOPENED', 'REMOVED', 'CARRYOVER'
);
CREATE TYPE "TaskAutomationJobStatus" AS ENUM (
  'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED'
);

ALTER TABLE "TaskDependency"
  ADD COLUMN "state" "TaskDependencyState" NOT NULL DEFAULT 'REQUIRED',
  ADD COLUMN "waivedAt" TIMESTAMP(3);
CREATE INDEX "TaskDependency_taskId_state_idx"
  ON "TaskDependency"("taskId", "state");

-- Snapshot the facts needed by historical metrics. These columns deliberately
-- do not reference User/Task so account and task deletion cannot rewrite facts.
ALTER TABLE "TaskWorkflowEvent"
  ADD COLUMN "taskCreatedAt" TIMESTAMP(3),
  ADD COLUMN "taskDueDate" TIMESTAMP(3),
  ADD COLUMN "taskPoints" INTEGER,
  ADD COLUMN "taskCreatorId" TEXT;

UPDATE "TaskWorkflowEvent" e
SET "taskCreatedAt" = t."createdAt",
    "taskDueDate" = t."dueDate",
    "taskPoints" = t."points",
    "taskCreatorId" = t."userId"
FROM "Task" t
WHERE t.id = e."taskId";

CREATE INDEX "TaskWorkflowEvent_taskCreatorId_createdAt_idx"
  ON "TaskWorkflowEvent"("taskCreatorId", "createdAt");

ALTER TABLE "SprintItem" ADD COLUMN "carriedFromId" TEXT;
CREATE INDEX "SprintItem_carriedFromId_idx" ON "SprintItem"("carriedFromId");
ALTER TABLE "SprintItem" ADD CONSTRAINT "SprintItem_carriedFromId_fkey"
  FOREIGN KEY ("carriedFromId") REFERENCES "SprintItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SprintItemEvent" (
  "id" TEXT NOT NULL,
  "sprintItemId" TEXT NOT NULL,
  "type" "SprintItemEventType" NOT NULL,
  "taskTitle" TEXT NOT NULL,
  "taskType" "TaskType" NOT NULL,
  "committedPoints" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SprintItemEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SprintItemEvent" (
  "id", "sprintItemId", "type", "taskTitle", "taskType",
  "committedPoints", "occurredAt"
)
SELECT
  CONCAT('sprint_item_event_committed_', i.id), i.id, 'COMMITTED',
  i."taskTitle", i."taskType", i."committedPoints", i."committedAt"
FROM "SprintItem" i;

INSERT INTO "SprintItemEvent" (
  "id", "sprintItemId", "type", "taskTitle", "taskType",
  "committedPoints", "occurredAt"
)
SELECT
  CONCAT('sprint_item_event_outcome_', i.id), i.id,
  i.outcome::text::"SprintItemEventType",
  i."taskTitle", i."taskType", i."committedPoints",
  COALESCE(i."completedAt", i."removedAt", i."committedAt")
FROM "SprintItem" i
WHERE i.outcome <> 'COMMITTED';

CREATE INDEX "SprintItemEvent_sprintItemId_occurredAt_idx"
  ON "SprintItemEvent"("sprintItemId", "occurredAt");
ALTER TABLE "SprintItemEvent" ADD CONSTRAINT "SprintItemEvent_sprintItemId_fkey"
  FOREIGN KEY ("sprintItemId") REFERENCES "SprintItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskAutomationJob" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "taskId" TEXT,
  "taskKey" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestedById" TEXT,
  "status" "TaskAutomationJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskAutomationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskAutomationJob_dedupeKey_key"
  ON "TaskAutomationJob"("dedupeKey");
CREATE INDEX "TaskAutomationJob_status_availableAt_createdAt_idx"
  ON "TaskAutomationJob"("status", "availableAt", "createdAt");
CREATE INDEX "TaskAutomationJob_taskKey_createdAt_idx"
  ON "TaskAutomationJob"("taskKey", "createdAt");
CREATE INDEX "TaskAutomationJob_workspaceId_status_idx"
  ON "TaskAutomationJob"("workspaceId", "status");
ALTER TABLE "TaskAutomationJob" ADD CONSTRAINT "TaskAutomationJob_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskAutomationJob" ADD CONSTRAINT "TaskAutomationJob_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAutomationJob" ADD CONSTRAINT "TaskAutomationJob_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A workspace must be transferred or deliberately deleted before its owner can
-- be physically removed. This turns accidental account deletion into a failed
-- operation instead of cascading through all shared work.
ALTER TABLE "Workspace" DROP CONSTRAINT "Workspace_ownerId_fkey";
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validate compatibility-era checks now that rollout code can report and
-- remediate bad rows before this migration is applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Task" WHERE points NOT IN (1, 2, 3, 5, 8, 13, 21, 34)
  ) THEN
    RAISE EXCEPTION 'Task contains unsupported story-point values';
  END IF;
  IF EXISTS (SELECT 1 FROM "Sprint" WHERE "capacityPoints" <= 0) THEN
    RAISE EXCEPTION 'Sprint contains non-positive capacity values';
  END IF;
END $$;

ALTER TABLE "Task" VALIDATE CONSTRAINT "Task_points_story_point_check";
ALTER TABLE "Sprint" VALIDATE CONSTRAINT "Sprint_capacity_positive_check";
