-- Lease for an in-flight delivery attempt. Manual retries claim the order
-- atomically instead of unconditionally writing delivery_pending, so two
-- concurrent admin retries can no longer both run the RCON grant.
ALTER TABLE "Order" ADD COLUMN "deliveryAttemptId" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryLeaseUntil" TIMESTAMP(3);
