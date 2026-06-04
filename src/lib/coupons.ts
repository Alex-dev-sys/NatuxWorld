import type { Coupon } from './types'

// Mock coupons (replace with DB in production)
const coupons: Coupon[] = [
  { code: 'NATUX10', type: 'percent', value: 10, description: 'Скидка 10%' },
  { code: 'NATUX20', type: 'percent', value: 20, description: 'Скидка 20%' },
  { code: 'LAUNCH', type: 'percent', value: 15, description: 'Скидка к запуску сервера 15%' },
  { code: 'VIP30', type: 'percent', value: 30, description: 'VIP-скидка 30%' },
  { code: 'CRYPTO', type: 'percent', value: 5, description: 'Скидка 5% за оплату криптой' },
  // Бесплатные коды для друзей — ранг выдаётся без оплаты
  { code: 'FRIEND2024', type: 'free', value: 0, description: 'Бесплатный ранг для друга' },
  { code: 'SADDLE', type: 'free', value: 0, description: 'Бесплатный ранг' },
]

export function validateCoupon(code: string): Coupon | null {
  return coupons.find(c => c.code.toUpperCase() === code.trim().toUpperCase()) ?? null
}

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
