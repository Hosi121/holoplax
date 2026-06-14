-- Promote the stringly-typed TaskStatusEvent.source to an enum. The column is a
-- write-only audit field (no readers), so we normalize the historically
-- mixed-case values to upper case, null out anything unexpected (defensive; the
-- app only ever wrote api/bulk/routine/SPRINT_END), then convert the type.
CREATE TYPE "TaskStatusEventSource" AS ENUM ('API', 'BULK', 'ROUTINE', 'SPRINT_END');

UPDATE "TaskStatusEvent" SET "source" = upper("source") WHERE "source" IS NOT NULL;
UPDATE "TaskStatusEvent"
  SET "source" = NULL
  WHERE "source" IS NOT NULL
    AND "source" NOT IN ('API', 'BULK', 'ROUTINE', 'SPRINT_END');

ALTER TABLE "TaskStatusEvent"
  ALTER COLUMN "source" TYPE "TaskStatusEventSource"
  USING "source"::"TaskStatusEventSource";
