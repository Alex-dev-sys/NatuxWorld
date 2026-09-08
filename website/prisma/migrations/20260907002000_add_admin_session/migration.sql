-- Persistent allowlist of live admin sessions. Replaces the in-process
-- revocation Map, which was emptied by every restart/redeploy — a cookie that
-- had been logged out started working again.
CREATE TABLE "AdminSession" (
    "sid" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
