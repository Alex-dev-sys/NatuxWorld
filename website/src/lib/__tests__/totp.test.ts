import { describe, it, expect } from 'vitest'
import { generateTotpSecret, verifyTotp, otpauthUri } from '@/lib/totp'
import { authenticator } from 'otplib'

describe('totp', () => {
  it('generates a base32 secret', () => {
    const s = generateTotpSecret()
    expect(s).toMatch(/^[A-Z2-7]+$/)
    expect(s.length).toBeGreaterThanOrEqual(16)
  })

  it('verifies a current code', () => {
    const s = generateTotpSecret()
    const code = authenticator.generate(s)
    expect(verifyTotp(code, s)).toBe(true)
  })

  it('rejects a wrong code', () => {
    const s = generateTotpSecret()
    expect(verifyTotp('000000', s)).toBe(false)
  })

  it('builds an otpauth uri with issuer and account', () => {
    const uri = otpauthUri('jockey_pockey', 'JBSWY3DPEHPK3PXP')
    expect(uri).toContain('otpauth://totp/')
    expect(uri).toContain('NATUX')
    expect(uri).toContain('jockey_pockey')
  })
})
