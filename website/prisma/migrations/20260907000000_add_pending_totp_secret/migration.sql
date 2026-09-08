-- Pending TOTP enrollment secret, held separately from the active one so that
-- starting (and abandoning) a re-enrollment cannot break the authenticator the
-- account is currently using.
ALTER TABLE "User" ADD COLUMN "pendingTotpSecretEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "pendingTotpExpires" TIMESTAMP(3);
