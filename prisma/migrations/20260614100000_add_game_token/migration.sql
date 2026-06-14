-- CreateTable
CREATE TABLE "GameToken" (
    "accessToken" TEXT NOT NULL,
    "clientToken" TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "serverId"    TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameToken_pkey" PRIMARY KEY ("accessToken")
);

-- CreateIndex
CREATE INDEX "GameToken_userId_idx" ON "GameToken"("userId");

-- CreateIndex
CREATE INDEX "GameToken_serverId_idx" ON "GameToken"("serverId");
