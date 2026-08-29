CREATE TABLE "CrashReport" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "exitCode" INTEGER,
    "logs" TEXT[],
    "version" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT '',
    "arch" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrashReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrashReport_createdAt_idx" ON "CrashReport"("createdAt");
CREATE INDEX "CrashReport_kind_idx" ON "CrashReport"("kind");
