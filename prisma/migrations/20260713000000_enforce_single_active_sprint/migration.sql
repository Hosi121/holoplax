-- A workspace must never have more than one active sprint. Keep the newest
-- active row when repairing legacy data, then enforce the invariant in the DB.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "workspaceId"
    ORDER BY "startedAt" DESC, "createdAt" DESC, "id" DESC
  ) AS position
  FROM "Sprint"
  WHERE "status" = 'ACTIVE'
)
UPDATE "Sprint" AS sprint
SET "status" = 'CLOSED', "endedAt" = COALESCE(sprint."endedAt", NOW())
FROM ranked
WHERE sprint."id" = ranked."id" AND ranked.position > 1;

-- Repair SPRINT tasks that may point at one of the duplicate rows just closed.
UPDATE "Task" AS task
SET "sprintId" = active."id"
FROM "Sprint" AS active
WHERE active."workspaceId" = task."workspaceId"
  AND active."status" = 'ACTIVE'
  AND task."status" = 'SPRINT'
  AND task."sprintId" IS DISTINCT FROM active."id";

CREATE UNIQUE INDEX "Sprint_one_active_per_workspace"
  ON "Sprint" ("workspaceId")
  WHERE "status" = 'ACTIVE';

-- Velocity is a one-to-one projection of a closed sprint. Existing rows stay
-- nullable because the old UI allowed untraceable manual entries.
ALTER TABLE "VelocityEntry" ADD COLUMN "sprintId" TEXT;
CREATE UNIQUE INDEX "VelocityEntry_sprintId_key" ON "VelocityEntry" ("sprintId");
CREATE INDEX "VelocityEntry_workspaceId_createdAt_idx"
  ON "VelocityEntry" ("workspaceId", "createdAt" DESC);
ALTER TABLE "VelocityEntry" ADD CONSTRAINT "VelocityEntry_sprintId_fkey"
  FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
