-- A Task always belongs to a workspace (multi-tenant invariant) and a creator.
-- Owner FKs were nullable, which allowed unreachable orphan rows (a null
-- workspace is invisible to every tenant) and forced null-handling everywhere.
-- Delete any legacy orphans, then enforce NOT NULL. All current code paths
-- already set both owners on create.
DELETE FROM "Task" WHERE "workspaceId" IS NULL OR "userId" IS NULL;
ALTER TABLE "Task" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "userId" SET NOT NULL;
