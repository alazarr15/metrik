-- CreateTable
CREATE TABLE "youtube_channels" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uploadsPlaylistId" TEXT NOT NULL,
    "subscriberCount" INTEGER,
    "totalViewCount" BIGINT,
    "videoCount" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_videos" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "duration" TEXT,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_video_observations" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "commentCount" INTEGER,

    CONSTRAINT "youtube_video_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_sync_runs" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "videosFetched" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "youtube_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "youtube_channels_handle_key" ON "youtube_channels"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_channels_youtubeChannelId_key" ON "youtube_channels"("youtubeChannelId");

-- CreateIndex
CREATE INDEX "youtube_videos_channelId_publishedAt_idx" ON "youtube_videos"("channelId", "publishedAt");

-- CreateIndex
CREATE INDEX "youtube_videos_publishedAt_idx" ON "youtube_videos"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_videos_channelId_youtubeVideoId_key" ON "youtube_videos"("channelId", "youtubeVideoId");

-- CreateIndex
CREATE INDEX "youtube_video_observations_videoId_observedAt_idx" ON "youtube_video_observations"("videoId", "observedAt");

-- CreateIndex
CREATE INDEX "youtube_sync_runs_channelId_startedAt_idx" ON "youtube_sync_runs"("channelId", "startedAt");

-- AddForeignKey
ALTER TABLE "youtube_videos" ADD CONSTRAINT "youtube_videos_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "youtube_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_video_observations" ADD CONSTRAINT "youtube_video_observations_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "youtube_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_sync_runs" ADD CONSTRAINT "youtube_sync_runs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "youtube_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
