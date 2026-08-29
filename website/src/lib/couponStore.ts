// src/lib/couponStore.ts
// Промокоды в БД: валидация и атомарное списание использований.
import { prisma } from './db'
import type { Coupon } from './types'

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

export async function validateCoupon(code: string): Promise<Coupon | null> {
  const normalized = normalizeCode(code)
  const row = await prisma.coupon.findUnique({ where: { code: normalized } })
  if (!row) return null
  if (!row.active) return null
  if (row.expiresAt && row.expiresAt < new Date()) return null
  if (row.maxUses != null && row.usedCount >= row.maxUses) return null
  return {
    code: row.code,
    type: row.type as Coupon['type'],
    value: row.value,
    description: row.description,
    maxUses: row.maxUses ?? undefined,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt?.toISOString(),
    active: row.active,
  }
}

// Атомарно увеличивает usedCount с проверкой лимита прямо в SQL:
// Prisma updateMany не умеет сравнивать две колонки ("usedCount" < "maxUses"),
// поэтому используем $executeRaw (параметры экранируются автоматически).
export async function redeemCoupon(code: string): Promise<boolean> {
  const normalized = normalizeCode(code)
  const affected = await prisma.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "code" = ${normalized} AND "active" = true AND ("maxUses" IS NULL OR "usedCount" < "maxUses") AND ("expiresAt" IS NULL OR "expiresAt" > NOW())`
  return affected === 1
}
