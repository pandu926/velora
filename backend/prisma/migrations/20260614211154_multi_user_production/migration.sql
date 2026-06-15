-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "risk_appetite" TEXT NOT NULL DEFAULT 'moderate',
    "max_position_pct" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "preferred_chains" TEXT[] DEFAULT ARRAY['base']::TEXT[],
    "ai_profile" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_strategies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_value" DOUBLE PRECISION NOT NULL,
    "current_value" DOUBLE PRECISION NOT NULL,
    "risk_level" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL DEFAULT '6m',
    "delegation_id" TEXT,
    "plan" JSONB,
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "auto_execute" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3),
    "stopped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_states" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "total_value" DOUBLE PRECISION NOT NULL,
    "allocations" JSONB NOT NULL,
    "entry_prices" JSONB NOT NULL,
    "realized_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daily_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "session_id" TEXT,
    "tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_wallet_address_key" ON "user_profiles"("wallet_address");

-- CreateIndex
CREATE INDEX "user_strategies_user_id_status_idx" ON "user_strategies"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_states_user_id_key" ON "portfolio_states"("user_id");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_strategies" ADD CONSTRAINT "user_strategies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_states" ADD CONSTRAINT "portfolio_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
