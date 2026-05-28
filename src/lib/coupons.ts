import type { Coupon } from './types'

// Mock coupons (replace with DB in production)
const coupons: Coupon[] = [
  { code: 'NATUX10', type: 'percent', value: 10, description: 'Скидка 10%' },
  { code: 'WELCOME', type: 'percent', value: 15, description: 'Скидка для новичков 15%' },
  { code: 'SUMMER25', type: 'percent', value: 25, description: 'Летняя акция −25%' },
  { code: 'VK100', type: 'fixed', value: 100, description: 'Скидка 100₽ за подписку VK' },
]

export function validateCoupon(code: string): Coupon | null {
  return coupons.find(c => c.code.toUpperCase() === code.trim().toUpperCase()) ?? null
}

export function applyDiscount(price: number, coupon: Coupon): number {
  if (coupon.type === 'percent') {
    return Math.max(1, Math.round(price * (1 - coupon.value / 100)))
  }
  return Math.max(1, price - coupon.value)
}
