-- CreateTable
CREATE TABLE "client_visits" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'client',
    "event" TEXT NOT NULL DEFAULT 'view',
    "platform" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_visits_createdAt_idx" ON "client_visits"("createdAt");

-- CreateIndex
CREATE INDEX "client_visits_role_createdAt_idx" ON "client_visits"("role", "createdAt");
