-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'OPENAI_COMPATIBLE', 'ANTHROPIC');

-- CreateTable
CREATE TABLE "AiProviderSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "provider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "model" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "baseUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderSetting_pkey" PRIMARY KEY ("id")
);
