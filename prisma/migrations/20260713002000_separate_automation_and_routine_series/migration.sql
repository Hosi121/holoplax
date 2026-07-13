-- Split the legacy TaskAutomationState axis into automation lifecycle,
-- hierarchy provenance, and creation origin. Keep the legacy column during
-- the compatibility window so older clients can continue to read it.
CREATE TYPE "TaskAutomationStatus" AS ENUM (
  'NONE',
  'PREPARED',
  'SPLIT_PENDING',
  'SPLIT_REJECTED'
);

CREATE TYPE "TaskHierarchyRole" AS ENUM (
  'STANDARD',
  'SPLIT_PARENT',
  'SPLIT_CHILD'
);

CREATE TYPE "TaskOrigin" AS ENUM (
  'MANUAL',
  'INTAKE',
  'AUTOMATION',
  'ROUTINE',
  'ONBOARDING'
);

ALTER TABLE "Task"
  ADD COLUMN "automationStatus" "TaskAutomationStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "hierarchyRole" "TaskHierarchyRole" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "origin" "TaskOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "routineSeriesId" TEXT;

-- Work belongs to the workspace, not permanently to the member who created
-- it. Deleting a former member must not delete tasks, sprint history, or
-- velocity projections.
ALTER TABLE "Task" DROP CONSTRAINT "Task_userId_fkey";
ALTER TABLE "Task" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sprint" DROP CONSTRAINT "Sprint_userId_fkey";
ALTER TABLE "Sprint" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Sprint"
  ADD CONSTRAINT "Sprint_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VelocityEntry" DROP CONSTRAINT "VelocityEntry_userId_fkey";
ALTER TABLE "VelocityEntry"
  ADD CONSTRAINT "VelocityEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Task"
SET "automationStatus" = CASE "automationState"
  WHEN 'DELEGATED' THEN 'PREPARED'::"TaskAutomationStatus"
  WHEN 'PENDING_SPLIT' THEN 'SPLIT_PENDING'::"TaskAutomationStatus"
  WHEN 'SPLIT_REJECTED' THEN 'SPLIT_REJECTED'::"TaskAutomationStatus"
  ELSE 'NONE'::"TaskAutomationStatus"
END,
"hierarchyRole" = CASE "automationState"
  WHEN 'SPLIT_PARENT' THEN 'SPLIT_PARENT'::"TaskHierarchyRole"
  WHEN 'SPLIT_CHILD' THEN 'SPLIT_CHILD'::"TaskHierarchyRole"
  ELSE 'STANDARD'::"TaskHierarchyRole"
END,
"origin" = CASE
  WHEN "automationState" = 'SPLIT_CHILD' THEN 'AUTOMATION'::"TaskOrigin"
  WHEN EXISTS (
    SELECT 1 FROM "IntakeItem" i WHERE i."taskId" = "Task".id
  ) THEN 'INTAKE'::"TaskOrigin"
  WHEN EXISTS (
    SELECT 1
    FROM "TaskWorkflowEvent" e
    WHERE e."taskKey" = "Task".id AND e."trigger" = 'ROUTINE'
  ) THEN 'ROUTINE'::"TaskOrigin"
  ELSE 'MANUAL'::"TaskOrigin"
END;

CREATE INDEX "Task_workspaceId_automationStatus_idx"
  ON "Task"("workspaceId", "automationStatus");
CREATE INDEX "Task_routineSeriesId_createdAt_idx"
  ON "Task"("routineSeriesId", "createdAt");

-- A series owns recurrence identity and schedule. RoutineRule remains as the
-- compatibility pointer to the next active occurrence during migration.
CREATE TABLE "RoutineSeries" (
  "id" TEXT NOT NULL,
  "cadence" "RoutineCadence" NOT NULL,
  "nextAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoutineSeries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RoutineRule" ADD COLUMN "seriesId" TEXT;

INSERT INTO "RoutineSeries" (
  "id", "cadence", "nextAt", "timezone", "active", "workspaceId",
  "createdById", "createdAt", "updatedAt"
)
SELECT
  'routine-series-' || r.id,
  r.cadence,
  r."nextAt",
  r.timezone,
  true,
  t."workspaceId",
  t."userId",
  r."createdAt",
  r."updatedAt"
FROM "RoutineRule" r
JOIN "Task" t ON t.id = r."taskId";

UPDATE "RoutineRule"
SET "seriesId" = 'routine-series-' || id;

UPDATE "Task" t
SET "routineSeriesId" = r."seriesId"
FROM "RoutineRule" r
WHERE r."taskId" = t.id;

ALTER TABLE "RoutineRule" ALTER COLUMN "seriesId" SET NOT NULL;
CREATE UNIQUE INDEX "RoutineRule_seriesId_key" ON "RoutineRule"("seriesId");
CREATE INDEX "RoutineSeries_workspaceId_active_nextAt_idx"
  ON "RoutineSeries"("workspaceId", "active", "nextAt");

ALTER TABLE "RoutineSeries"
  ADD CONSTRAINT "RoutineSeries_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineSeries"
  ADD CONSTRAINT "RoutineSeries_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoutineRule"
  ADD CONSTRAINT "RoutineRule_seriesId_fkey"
  FOREIGN KEY ("seriesId") REFERENCES "RoutineSeries"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_routineSeriesId_fkey"
  FOREIGN KEY ("routineSeriesId") REFERENCES "RoutineSeries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
