-- CreateEnum
CREATE TYPE "AiSuggestionType" AS ENUM ('TIP', 'SCORE', 'SPLIT');

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL,
    "type" "AiSuggestionType" NOT NULL,
    "taskId" TEXT,
    "inputTitle" TEXT NOT NULL,
    "inputDescription" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
