-- DropForeignKey
ALTER TABLE "AiSuggestion" DROP CONSTRAINT "AiSuggestion_taskId_fkey";

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
