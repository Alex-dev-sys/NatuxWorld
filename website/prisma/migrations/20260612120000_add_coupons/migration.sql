-- CreateTable
CREATE TABLE "Coupon" (
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("code")
);

-- Seed: действующие скидочные промокоды.
-- Бесплатные коды (free) намеренно не сидируются: утёкшие FRIEND2024/SADDLE
-- отозваны, новые бесплатные коды админ добавляет вручную.
INSERT INTO "Coupon" ("code", "type", "value", "description") VALUES
    ('NATUX10', 'percent', 10, 'Скидка 10%'),
    ('NATUX20', 'percent', 20, 'Скидка 20%'),
    ('LAUNCH', 'percent', 15, 'Скидка к запуску сервера 15%'),
    ('VIP30', 'percent', 30, 'VIP-скидка 30%'),
    ('CRYPTO', 'percent', 5, 'Скидка 5% за оплату криптой');

-- SUMMER25 ограничен сроком акции (соответствует NEXT_PUBLIC_SALE_END,
-- 2026-06-30 23:59:59 МСК = 20:59:59 UTC).
INSERT INTO "Coupon" ("code", "type", "value", "description", "expiresAt") VALUES
    ('SUMMER25', 'percent', 25, 'Летняя скидка 25%', TIMESTAMP '2026-06-30 20:59:59');
