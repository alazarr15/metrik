-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('VIEWS', 'REACTIONS', 'COMMENTS');

-- CreateEnum
CREATE TYPE "MetricPrecision" AS ENUM ('EXACT', 'ROUNDED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "telegramUsername" TEXT NOT NULL,
    "title" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "telegramMessageId" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "text" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_metric_observations" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metricType" "MetricType" NOT NULL,
    "rawValue" TEXT,
    "numericValue" INTEGER,
    "precision" "MetricPrecision" NOT NULL,

    CONSTRAINT "post_metric_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "postsFetched" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_telegramUsername_key" ON "channels"("telegramUsername");

-- CreateIndex
CREATE INDEX "posts_channelId_publishedAt_idx" ON "posts"("channelId", "publishedAt");

-- CreateIndex
CREATE INDEX "posts_publishedAt_idx" ON "posts"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "posts_channelId_telegramMessageId_key" ON "posts"("channelId", "telegramMessageId");

-- CreateIndex
CREATE INDEX "post_metric_observations_postId_observedAt_idx" ON "post_metric_observations"("postId", "observedAt");

-- CreateIndex
CREATE INDEX "post_metric_observations_metricType_observedAt_idx" ON "post_metric_observations"("metricType", "observedAt");

-- CreateIndex
CREATE INDEX "sync_runs_channelId_startedAt_idx" ON "sync_runs"("channelId", "startedAt");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_metric_observations" ADD CONSTRAINT "post_metric_observations_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce Data Integrity Rules (Check Constraints)
-- 1. UNAVAILABLE must have numericValue = null
-- 2. EXACT and ROUNDED must have non-null numericValue >= 0
-- 3. Missing counters must never be stored as zero
ALTER TABLE "post_metric_observations" ADD CONSTRAINT "chk_observation_precision_rules" CHECK (
    ("precision" = 'UNAVAILABLE' AND "numericValue" IS NULL) OR
    ("precision" IN ('EXACT', 'ROUNDED') AND "numericValue" IS NOT NULL AND "numericValue" >= 0)
);
