CREATE TABLE "GameEvent" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT,
  "username"  TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "message"   TEXT NOT NULL DEFAULT '',
  "world"     TEXT NOT NULL DEFAULT '',
  "x"         DOUBLE PRECISION,
  "y"         DOUBLE PRECISION,
  "z"         DOUBLE PRECISION,
  "extra"     TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GameEvent_username_idx" ON "GameEvent"("username");
CREATE INDEX "GameEvent_userId_idx" ON "GameEvent"("userId");
CREATE INDEX "GameEvent_createdAt_idx" ON "GameEvent"("createdAt");
CREATE INDEX "GameEvent_kind_idx" ON "GameEvent"("kind");
