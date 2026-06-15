-- prisma/migrations/20260615230000_add_two_factor/migration.sql
ALTER TABLE "User"
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorMethod" TEXT,
  ADD COLUMN "totpSecretEnc" TEXT,
  ADD COLUMN "twoFactorCode" TEXT,
  ADD COLUMN "twoFactorCodeExpires" TIMESTAMP(3);

CREATE TABLE "TwoFactorBackupCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TwoFactorBackupCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TwoFactorBackupCode_userId_idx" ON "TwoFactorBackupCode"("userId");
ALTER TABLE "TwoFactorBackupCode" ADD CONSTRAINT "TwoFactorBackupCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AppPassword" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "AppPassword_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AppPassword_userId_idx" ON "AppPassword"("userId");
ALTER TABLE "AppPassword" ADD CONSTRAINT "AppPassword_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
