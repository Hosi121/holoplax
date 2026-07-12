-- Replace the status-only lookup with indexes that also satisfy the task
-- list's newest-first ordering. This avoids sorting every matching task before
-- applying the page limit and gives cursor pagination a deterministic tie-break.
DROP INDEX "Task_workspaceId_status_idx";

CREATE INDEX "Task_workspaceId_status_createdAt_id_idx"
ON "Task"("workspaceId", "status", "createdAt" DESC, "id" DESC);

CREATE INDEX "Task_workspaceId_createdAt_id_idx"
ON "Task"("workspaceId", "createdAt" DESC, "id" DESC);
