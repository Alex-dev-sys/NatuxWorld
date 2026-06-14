-- CreateTable
CREATE TABLE "LoginEvent" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT,
    "ip"        TEXT NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "kind"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginEvent_userId_idx" ON "LoginEvent"("userId");

-- CreateIndex
CREATE INDEX "LoginEvent_createdAt_idx" ON "LoginEvent"("createdAt");
