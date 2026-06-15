-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "evolutionCycle" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedReputation" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "votes" ADD COLUMN     "stakeLevel" TEXT NOT NULL DEFAULT 'none';

-- CreateIndex
CREATE INDEX "specializations_domain_accuracy_idx" ON "specializations"("domain", "accuracy");

-- CreateIndex
CREATE INDEX "votes_agentId_wasCorrect_idx" ON "votes"("agentId", "wasCorrect");
