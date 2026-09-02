-- News feed for the launcher + count-only launcher telemetry aggregates.
CREATE TABLE "NewsPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'update',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NewsPost_published_createdAt_idx" ON "NewsPost"("published", "createdAt");

CREATE TABLE "LauncherEventStat" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "arch" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LauncherEventStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LauncherEventStat_event_version_platform_arch_day_key"
  ON "LauncherEventStat"("event", "version", "platform", "arch", "day");
