-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "challengeLog" JSONB,
ADD COLUMN     "convictionLog" JSONB,
ADD COLUMN     "executionResult" JSONB,
ADD COLUMN     "trigger" TEXT,
ADD COLUMN     "triggerData" JSONB;
