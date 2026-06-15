-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "orchestratorModel" TEXT,
ADD COLUMN     "user_address" TEXT;

-- CreateIndex
CREATE INDEX "sessions_user_address_idx" ON "sessions"("user_address");
