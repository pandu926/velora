-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reputation" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "correctCalls" INTEGER NOT NULL DEFAULT 0,
    "incorrectCalls" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "replacedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specializations" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "proposal" TEXT NOT NULL,
    "proposalDomain" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'vote',
    "evidenceSnapshot" JSONB,
    "consensusReached" BOOLEAN NOT NULL DEFAULT false,
    "finalPercentage" DOUBLE PRECISION,
    "weightedPercentage" DOUBLE PRECISION,
    "verdictAction" TEXT,
    "orchestratorSummary" TEXT,
    "totalRounds" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "dataPayload" JSONB,
    "compositeRisk" DOUBLE PRECISION,
    "stakedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wasCorrect" BOOLEAN,
    "reputationDelta" DOUBLE PRECISION,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcomes" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "valueDelta" DOUBLE PRECISION,
    "measuredAt" TIMESTAMP(3),
    "measureMethod" TEXT NOT NULL DEFAULT 'auto',
    "userOverride" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_law" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "protocol" TEXT,
    "riskLevel" TEXT NOT NULL,
    "outcome" TEXT,
    "marketCondition" TEXT,
    "lessonSummary" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_law_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_history" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "reputationAfter" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolution_events" (
    "id" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "replacedAgentId" TEXT NOT NULL,
    "replacedModel" TEXT NOT NULL,
    "newAgentId" TEXT NOT NULL,
    "newModel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "performanceBefore" DOUBLE PRECISION NOT NULL,
    "performanceAfter" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evolution_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "specializations_agentId_domain_key" ON "specializations"("agentId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "votes_sessionId_agentId_key" ON "votes"("sessionId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "outcomes_sessionId_key" ON "outcomes"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "case_law_sessionId_key" ON "case_law"("sessionId");

-- CreateIndex
CREATE INDEX "case_law_domain_outcome_idx" ON "case_law"("domain", "outcome");

-- CreateIndex
CREATE INDEX "case_law_riskLevel_idx" ON "case_law"("riskLevel");

-- CreateIndex
CREATE INDEX "reputation_history_agentId_createdAt_idx" ON "reputation_history"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "specializations" ADD CONSTRAINT "specializations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_law" ADD CONSTRAINT "case_law_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_history" ADD CONSTRAINT "reputation_history_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
