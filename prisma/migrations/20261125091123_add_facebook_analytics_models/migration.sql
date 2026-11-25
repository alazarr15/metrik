-- CreateEnum
CREATE TYPE "FacebookItemType" AS ENUM ('POST', 'REEL');

-- CreateTable
CREATE TABLE "facebook_pages" (
    "id" TEXT NOT NULL,
    "facebookPageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "followersCount" INTEGER,
    "fanCount" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_items" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "facebookItemId" TEXT NOT NULL,
    "itemType" "FacebookItemType" NOT NULL DEFAULT 'POST',
    "message" TEXT,
    "permalinkUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "viewsCount" INTEGER,
    "reachCount" INTEGER,
    "reactionsCount" INTEGER,
    "commentsCount" INTEGER,
    "sharesCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_item_observations" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewsCount" INTEGER,
    "reachCount" INTEGER,
    "reactionsCount" INTEGER,
    "commentsCount" INTEGER,
    "sharesCount" INTEGER,

    CONSTRAINT "facebook_item_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_sync_runs" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "facebook_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facebook_pages_facebookPageId_key" ON "facebook_pages"("facebookPageId");

-- CreateIndex
CREATE INDEX "facebook_items_pageId_publishedAt_idx" ON "facebook_items"("pageId", "publishedAt");

-- CreateIndex
CREATE INDEX "facebook_items_publishedAt_idx" ON "facebook_items"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_items_pageId_facebookItemId_key" ON "facebook_items"("pageId", "facebookItemId");

-- CreateIndex
CREATE INDEX "facebook_item_observations_itemId_observedAt_idx" ON "facebook_item_observations"("itemId", "observedAt");

-- CreateIndex
CREATE INDEX "facebook_sync_runs_pageId_startedAt_idx" ON "facebook_sync_runs"("pageId", "startedAt");

-- AddForeignKey
ALTER TABLE "facebook_items" ADD CONSTRAINT "facebook_items_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "facebook_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_item_observations" ADD CONSTRAINT "facebook_item_observations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "facebook_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_sync_runs" ADD CONSTRAINT "facebook_sync_runs_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "facebook_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
