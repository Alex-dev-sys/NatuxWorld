import { describe, it, expect } from 'vitest'
import { toCryptoAmount } from '@/lib/rates'

describe('toCryptoAmount', () => {
  it('converts an exact amount', () => {
    expect(toCryptoAmount(300, 300)).toBe('1.00')
  })

  it('converts a fractional amount', () => {
    expect(toCryptoAmount(150, 300)).toBe('0.50')
  })

  it('enforces the 0.01 minimum', () => {
    expect(toCryptoAmount(1, 1000)).toBe('0.01')
  })

  it('rounds to 2 decimals', () => {
    expect(toCryptoAmount(100, 3)).toBe('33.33')
  })
})
