-- Separate execution lifecycle from planning placement while retaining the
-- legacy Task.status/Task.sprintId projection for a staged client migration.
CREATE TYPE "TaskWorkflowState" AS ENUM (
  'READY', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED'
);

CREATE TYPE "SprintItemOutcome" AS ENUM (
  'COMMITTED', 'COMPLETED', 'REMOVED', 'CARRYOVER'
);

ALTER TABLE "Task"
  ADD COLUMN "workflowState" "TaskWorkflowState" NOT NULL DEFAULT 'READY';

UPDATE "Task"
SET "workflowState" = 'DONE'
WHERE "status" = 'DONE';

CREATE TABLE "TaskWorkflowEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT,
  "taskKey" TEXT NOT NULL,
  "fromState" "TaskWorkflowState",
  "toState" "TaskWorkflowState" NOT NULL,
  "actorId" TEXT,
  "trigger" "TaskStatusEventSource",
  "workspaceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskWorkflowEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SprintItem" (
  "id" TEXT NOT NULL,
  "sprintId" TEXT NOT NULL,
  "taskId" TEXT,
  "taskKey" TEXT NOT NULL,
  "taskTitle" TEXT NOT NULL,
  "taskType" "TaskType" NOT NULL,
  "committedPoints" INTEGER NOT NULL,
  "outcome" "SprintItemOutcome" NOT NULL DEFAULT 'COMMITTED',
  "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "SprintItem_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TaskWorkflowEvent" (
  "id", "taskId", "taskKey", "fromState", "toState", "actorId",
  "trigger", "workspaceId", "createdAt"
)
SELECT
  CONCAT('wf_initial_', t."id"), t."id", t."id", NULL, 'READY', t."userId",
  'API', t."workspaceId", t."createdAt"
FROM "Task" t;

INSERT INTO "TaskWorkflowEvent" (
  "id", "taskId", "taskKey", "fromState", "toState", "actorId",
  "trigger", "workspaceId", "createdAt"
)
SELECT
  CONCAT('wf_done_', t."id"), t."id", t."id", 'READY', 'DONE',
  COALESCE(done_event."actorId", t."userId"),
  COALESCE(done_event."trigger", 'API'), t."workspaceId",
  COALESCE(done_event."createdAt", t."updatedAt")
FROM "Task" t
LEFT JOIN LATERAL (
  SELECT e."actorId", e."trigger", e."createdAt"
  FROM "TaskStatusEvent" e
  WHERE e."taskId" = t."id" AND e."toStatus" = 'DONE'
  ORDER BY e."createdAt" DESC, e."id" DESC
  LIMIT 1
) done_event ON TRUE
WHERE t."status" = 'DONE';

INSERT INTO "SprintItem" (
  "id", "sprintId", "taskId", "taskKey", "taskTitle", "taskType",
  "committedPoints", "outcome", "committedAt", "completedAt"
)
SELECT
  CONCAT('sprint_item_', t."id", '_', t."sprintId"),
  t."sprintId", t."id", t."id", t."title", t."type", t."points",
  CASE WHEN t."status" = 'DONE'
    THEN 'COMPLETED'::"SprintItemOutcome"
    ELSE 'COMMITTED'::"SprintItemOutcome"
  END,
  GREATEST(t."createdAt", s."startedAt"),
  CASE WHEN t."status" = 'DONE' THEN COALESCE(done_event."createdAt", t."updatedAt") END
FROM "Task" t
JOIN "Sprint" s ON s."id" = t."sprintId"
LEFT JOIN LATERAL (
  SELECT e."createdAt"
  FROM "TaskStatusEvent" e
  WHERE e."taskId" = t."id" AND e."toStatus" = 'DONE'
  ORDER BY e."createdAt" DESC, e."id" DESC
  LIMIT 1
) done_event ON TRUE
WHERE t."sprintId" IS NOT NULL;

CREATE UNIQUE INDEX "SprintItem_sprintId_taskKey_key"
  ON "SprintItem"("sprintId", "taskKey");
CREATE INDEX "SprintItem_sprintId_outcome_idx"
  ON "SprintItem"("sprintId", "outcome");
CREATE INDEX "SprintItem_taskId_committedAt_idx"
  ON "SprintItem"("taskId", "committedAt");
CREATE INDEX "TaskWorkflowEvent_taskKey_createdAt_idx"
  ON "TaskWorkflowEvent"("taskKey", "createdAt");
CREATE INDEX "TaskWorkflowEvent_workspaceId_createdAt_idx"
  ON "TaskWorkflowEvent"("workspaceId", "createdAt");
CREATE INDEX "TaskWorkflowEvent_workspaceId_toState_createdAt_idx"
  ON "TaskWorkflowEvent"("workspaceId", "toState", "createdAt");

ALTER TABLE "TaskWorkflowEvent" ADD CONSTRAINT "TaskWorkflowEvent_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskWorkflowEvent" ADD CONSTRAINT "TaskWorkflowEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskWorkflowEvent" ADD CONSTRAINT "TaskWorkflowEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SprintItem" ADD CONSTRAINT "SprintItem_sprintId_fkey"
  FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SprintItem" ADD CONSTRAINT "SprintItem_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing legacy rows are not rewritten silently, but every new or updated
-- row must use a supported estimate/capacity value.
ALTER TABLE "Task" ADD CONSTRAINT "Task_points_story_point_check"
  CHECK ("points" IN (1, 2, 3, 5, 8, 13, 21, 34)) NOT VALID;
ALTER TABLE "SprintItem" ADD CONSTRAINT "SprintItem_points_story_point_check"
  CHECK ("committedPoints" IN (1, 2, 3, 5, 8, 13, 21, 34));
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_capacity_positive_check"
  CHECK ("capacityPoints" > 0) NOT VALID;
