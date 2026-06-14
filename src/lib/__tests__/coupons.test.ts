import { describe, it, expect } from 'vitest'
import { applyDiscount, isFree } from '@/lib/coupons'
import type { Coupon } from '@/lib/types'

function makeCoupon(overrides: Partial<Coupon>): Coupon {
  return {
    code: 'TEST',
    type: 'percent',
    value: 0,
    description: 'test coupon',
    ...overrides,
  }
}

describe('applyDiscount', () => {
  it('applies a 10% discount to 100 → 90', () => {
    const coupon = makeCoupon({ type: 'percent', value: 10 })
    expect(applyDiscount(100, coupon)).toBe(90)
  })

  it('rounds percent results with Math.round', () => {
    // 99 - 15% = 84.15 → 84
    expect(applyDiscount(99, makeCoupon({ type: 'percent', value: 15 }))).toBe(84)
    // 99 - 50% = 49.5 → 50
    expect(applyDiscount(99, makeCoupon({ type: 'percent', value: 50 }))).toBe(50)
  })

  it('never goes below 1₽ for percent discounts', () => {
    const coupon = makeCoupon({ type: 'percent', value: 99 })
    expect(applyDiscount(1, coupon)).toBe(1)
  })

  it('returns 0 for free coupons', () => {
    const coupon = makeCoupon({ type: 'free', value: 0 })
    expect(applyDiscount(100, coupon)).toBe(0)
  })

  it('subtracts the value for fixed coupons', () => {
    const coupon = makeCoupon({ type: 'fixed', value: 30 })
    expect(applyDiscount(100, coupon)).toBe(70)
  })

  it('never goes below 1₽ for fixed discounts', () => {
    const coupon = makeCoupon({ type: 'fixed', value: 200 })
    expect(applyDiscount(100, coupon)).toBe(1)
  })
})

describe('isFree', () => {
  it('returns true for free coupons', () => {
    expect(isFree(makeCoupon({ type: 'free', value: 0 }))).toBe(true)
  })

  it('returns false for percent and fixed coupons', () => {
    expect(isFree(makeCoupon({ type: 'percent', value: 100 }))).toBe(false)
    expect(isFree(makeCoupon({ type: 'fixed', value: 100 }))).toBe(false)
  })
})
