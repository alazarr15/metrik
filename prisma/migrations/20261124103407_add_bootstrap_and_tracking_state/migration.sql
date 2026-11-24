-- CreateEnum
CREATE TYPE "BootstrapStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'INCOMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "bootstrapStatus" "BootstrapStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "nextPollAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "worker_heartbeats" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "workerId" TEXT NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pollIntervalMin" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);
