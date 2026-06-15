-- Recurrence is now modeled solely by the presence of a RoutineRule (cadence),
-- so ROUTINE is removed from the TaskType axis (which now means work-breakdown
-- level only). Existing ROUTINE rows become TASK; their RoutineRule (if any)
-- continues to express recurrence.
UPDATE "Task" SET "type" = 'TASK' WHERE "type" = 'ROUTINE';
UPDATE "AiSuggestionReaction" SET "taskType" = 'TASK' WHERE "taskType" = 'ROUTINE';

-- Postgres cannot DROP an enum value; recreate the type without ROUTINE and
-- repoint every dependent column before dropping the old type.
ALTER TYPE "TaskType" RENAME TO "TaskType_old";
CREATE TYPE "TaskType" AS ENUM ('EPIC', 'PBI', 'TASK');
ALTER TABLE "Task" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "type" TYPE "TaskType" USING ("type"::text::"TaskType");
ALTER TABLE "Task" ALTER COLUMN "type" SET DEFAULT 'PBI';
ALTER TABLE "AiSuggestionReaction" ALTER COLUMN "taskType" TYPE "TaskType" USING ("taskType"::text::"TaskType");
DROP TYPE "TaskType_old";
