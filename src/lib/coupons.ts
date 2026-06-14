// src/lib/coupons.ts
// Только чистые функции без обращений к БД — юнит-тесты импортируют этот
// файл напрямую. Поиск/списание промокодов — в couponStore.ts.
import type { Coupon } from './types'

export function applyDiscount(price: number, coupon: Coupon): number {
  if (coupon.type === 'free') return 0
  if (coupon.type === 'percent') {
    return Math.max(1, Math.round(price * (1 - coupon.value / 100)))
  }
  return Math.max(1, price - coupon.value)
}

export function isFree(coupon: Coupon): boolean {
  return coupon.type === 'free'
}
