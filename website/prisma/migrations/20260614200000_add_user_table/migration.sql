-- User table was created via db push; this migration backfills it for clean installs.
-- IF NOT EXISTS makes it a no-op on production where the table already exists.
CREATE TABLE IF NOT EXISTS "User" (
    "id"               TEXT NOT NULL,
    "username"         TEXT NOT NULL,
    "email"            TEXT NOT NULL,
    "passwordHash"     TEXT NOT NULL,
    "emailVerified"    BOOLEAN NOT NULL DEFAULT false,
    "verifyCode"       TEXT,
    "verifyCodeExpires" TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
