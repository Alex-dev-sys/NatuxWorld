import { describe, it, expect, afterEach } from 'vitest'
import { getPaymentProvider, isMockPaymentsEnabled } from '@/lib/paymentConfig'

const env = process.env as Record<string, string | undefined>
const original = env.PAYMENT_PROVIDER
const originalNodeEnv = env.NODE_ENV

afterEach(() => {
  if (original === undefined) delete env.PAYMENT_PROVIDER
  else env.PAYMENT_PROVIDER = original
  if (originalNodeEnv === undefined) delete env.NODE_ENV
  else env.NODE_ENV = originalNodeEnv
})

describe('payment configuration', () => {
  it('fails closed when provider is missing or unknown', () => {
    delete env.PAYMENT_PROVIDER
    expect(getPaymentProvider()).toBeNull()
    env.PAYMENT_PROVIDER = 'unexpected'
    expect(getPaymentProvider()).toBeNull()
  })

  it('does not allow mock payments in production', () => {
    env.PAYMENT_PROVIDER = 'mock'
    env.NODE_ENV = 'production'
    expect(getPaymentProvider()).toBeNull()
    expect(isMockPaymentsEnabled()).toBe(false)
  })

  it('allows an explicitly selected mock provider outside production', () => {
    env.PAYMENT_PROVIDER = 'mock'
    env.NODE_ENV = 'test'
    expect(getPaymentProvider()).toBe('mock')
    expect(isMockPaymentsEnabled()).toBe(true)
  })
})
