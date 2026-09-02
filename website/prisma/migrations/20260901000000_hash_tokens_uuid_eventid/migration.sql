-- One-time data migration for token hashing, precomputed offline UUIDs and
-- idempotent telemetry ingestion. Run by `prisma migrate deploy`.

-- 1. Hash legacy plaintext verification codes in place.
--    hashBackupCode() = sha256(trim(code).toLowerCase()); codes are digits,
--    so sha256 of the raw value is identical.
UPDATE "User" SET "verifyCode" = encode(sha256("verifyCode"::bytea), 'hex')
WHERE "verifyCode" IS NOT NULL;

-- 2. Hash legacy plaintext game access tokens in place. Tokens are lowercase
--    hex (randomBytes), so the digest matches the application-side hashing.
UPDATE "GameToken" SET "accessToken" = encode(sha256("accessToken"::bytea), 'hex');

-- 3. Backfill the precomputed offline UUID (v3, md5 of 'OfflinePlayer:' +
--    username), replicating offlineUuid() from src/lib/yggdrasil.ts:
--      hash[6] = (hash[6] & 0x0f) | 0x30  -> hex char 13 becomes '3'
--      hash[8] = (hash[8] & 0x3f) | 0x80  -> hex chars 17-18 recomputed
ALTER TABLE "User" ADD COLUMN "uuid" TEXT;

WITH ver AS (
  SELECT "id", substr(h, 1, 12) || '3' || substr(h, 14, 19) AS h2
  FROM (SELECT "id", md5('OfflinePlayer:' || "username") AS h FROM "User") b
)
UPDATE "User" u
SET "uuid" = substr(v.h2, 1, 16)
  || to_hex((get_byte(decode(substr(v.h2, 17, 2), 'hex'), 0) % 64) + 128)
  || substr(v.h2, 19, 14)
FROM ver v
WHERE v."id" = u."id";

ALTER TABLE "User" ALTER COLUMN "uuid" SET NOT NULL;
CREATE UNIQUE INDEX "User_uuid_key" ON "User"("uuid");

-- 4. Idempotent telemetry: unique eventId lets the API drop replayed batches.
ALTER TABLE "GameEvent" ADD COLUMN "eventId" TEXT;
CREATE UNIQUE INDEX "GameEvent_eventId_key" ON "GameEvent"("eventId");
