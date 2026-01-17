-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('EPIC', 'PBI', 'TASK', 'ROUTINE');

-- AlterTable
ALTER TABLE "Task"
ADD COLUMN "type" "TaskType" NOT NULL DEFAULT 'PBI',
ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- AddForeignKey
ALTER TABLE "Task"
ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
