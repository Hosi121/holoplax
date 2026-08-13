-- Expand phase for removing Task.automationState. The application now stores
-- automation lifecycle and structural provenance independently in
-- automationStatus and hierarchyRole.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Task"
    WHERE "automationState"::text <> CASE
      WHEN "hierarchyRole" = 'SPLIT_PARENT' THEN 'SPLIT_PARENT'
      WHEN "hierarchyRole" = 'SPLIT_CHILD' THEN 'SPLIT_CHILD'
      WHEN "automationStatus" = 'PREPARED' THEN 'DELEGATED'
      WHEN "automationStatus" = 'SPLIT_PENDING' THEN 'PENDING_SPLIT'
      WHEN "automationStatus" = 'SPLIT_REJECTED' THEN 'SPLIT_REJECTED'
      ELSE 'NONE'
    END
  ) THEN
    RAISE EXCEPTION 'Task contains divergent automation projections';
  END IF;
END $$;

CREATE FUNCTION "sync_task_legacy_automation_state"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."automationState" := CASE
    WHEN NEW."hierarchyRole" = 'SPLIT_PARENT' THEN 'SPLIT_PARENT'::"TaskAutomationState"
    WHEN NEW."hierarchyRole" = 'SPLIT_CHILD' THEN 'SPLIT_CHILD'::"TaskAutomationState"
    WHEN NEW."automationStatus" = 'PREPARED' THEN 'DELEGATED'::"TaskAutomationState"
    WHEN NEW."automationStatus" = 'SPLIT_PENDING' THEN 'PENDING_SPLIT'::"TaskAutomationState"
    WHEN NEW."automationStatus" = 'SPLIT_REJECTED' THEN 'SPLIT_REJECTED'::"TaskAutomationState"
    ELSE 'NONE'::"TaskAutomationState"
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Task_sync_legacy_automation_state"
BEFORE INSERT OR UPDATE OF "automationStatus", "hierarchyRole", "automationState"
ON "Task"
FOR EACH ROW
EXECUTE FUNCTION "sync_task_legacy_automation_state"();
