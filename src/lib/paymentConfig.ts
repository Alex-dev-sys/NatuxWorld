export type PaymentProvider = 'mock' | 'cryptobot' | 'yookassa' | 'multi'

const PROVIDERS = new Set<PaymentProvider>(['mock', 'cryptobot', 'yookassa', 'multi'])

/** Payment configuration is fail-closed; mock is never available in production. */
export function getPaymentProvider(): PaymentProvider | null {
  const value = process.env.PAYMENT_PROVIDER?.trim().toLowerCase()
  if (!value || !PROVIDERS.has(value as PaymentProvider)) return null
  if (value === 'mock' && process.env.NODE_ENV === 'production') return null
  return value as PaymentProvider
}

export function isMockPaymentsEnabled(): boolean {
  return getPaymentProvider() === 'mock'
}
