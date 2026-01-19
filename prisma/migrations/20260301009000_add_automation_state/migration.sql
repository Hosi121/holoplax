-- CreateEnum
CREATE TYPE "AutomationState" AS ENUM ('NONE', 'DELEGATED', 'PENDING_SPLIT', 'SPLIT_PARENT', 'SPLIT_CHILD', 'SPLIT_REJECTED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "automationState" "AutomationState" NOT NULL DEFAULT 'NONE';
