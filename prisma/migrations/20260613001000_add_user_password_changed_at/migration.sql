-- Add passwordChangedAt to support session invalidation on password change/reset.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
