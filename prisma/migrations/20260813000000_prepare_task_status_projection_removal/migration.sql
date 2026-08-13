-- Expand phase for removing Task.status. The application no longer reads or
-- writes this column; workflowState and current sprintId are canonical.
--
-- The deployment pipeline migrates before replacing the running ECS service,
-- so the physical column must survive one rollout for old processes. A trigger
-- keeps that DB-only compatibility projection synchronized until the contract
-- phase drops the trigger, column, enum-only indexes, and function.

-- Refuse to preserve a divergent projection without an explicit data repair.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Task" AS task
    LEFT JOIN "Sprint" AS sprint ON sprint.id = task."sprintId"
    WHERE task.status::text <> CASE
      WHEN task."workflowState" = 'DONE' THEN 'DONE'
      WHEN sprint.status = 'ACTIVE' THEN 'SPRINT'
      ELSE 'BACKLOG'
    END
  ) THEN
    RAISE EXCEPTION 'Task contains divergent status/workflow/sprint projections';
  END IF;
END $$;

-- Closed sprint history is already preserved by SprintItem. Do not retain a
-- closed sprint as current Task membership.
UPDATE "Task" AS task
SET "sprintId" = NULL
FROM "Sprint" AS sprint
WHERE task."sprintId" = sprint.id
  AND sprint.status = 'CLOSED';

CREATE INDEX "Task_workspaceId_workflowState_createdAt_id_idx"
  ON "Task"("workspaceId", "workflowState", "createdAt" DESC, "id" DESC);
CREATE INDEX "Task_sprintId_workflowState_idx"
  ON "Task"("sprintId", "workflowState");

CREATE FUNCTION "sync_task_legacy_status"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sprint_is_active boolean := false;
BEGIN
  IF NEW."workflowState" = 'DONE' THEN
    NEW.status := 'DONE'::"TaskStatus";
  ELSIF NEW."sprintId" IS NOT NULL THEN
    SELECT sprint.status = 'ACTIVE'
    INTO sprint_is_active
    FROM "Sprint" AS sprint
    WHERE sprint.id = NEW."sprintId";
    NEW.status := CASE
      WHEN COALESCE(sprint_is_active, false) THEN 'SPRINT'::"TaskStatus"
      ELSE 'BACKLOG'::"TaskStatus"
    END;
  ELSE
    NEW.status := 'BACKLOG'::"TaskStatus";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Task_sync_legacy_status"
BEFORE INSERT OR UPDATE OF "workflowState", "sprintId", status
ON "Task"
FOR EACH ROW
EXECUTE FUNCTION "sync_task_legacy_status"();
