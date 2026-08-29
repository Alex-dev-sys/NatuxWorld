-- Capture immutable fulfillment instructions at checkout so catalog edits cannot
-- change what an already-created order delivers.
ALTER TABLE "Order"
  ADD COLUMN "fulfillmentCommands" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Bind Yggdrasil tokens to the user session generation that created them. A
-- password reset, global logout, admin revoke, or 2FA reset increments the user
-- tokenVersion and immediately invalidates previously issued game tokens.
ALTER TABLE "GameToken"
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
