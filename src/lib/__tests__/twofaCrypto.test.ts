import { describe, it, expect, beforeEach } from 'vitest'
import { encryptSecret, decryptSecret } from '@/lib/twofaCrypto'

describe('twofaCrypto', () => {
  beforeEach(() => { process.env.TWOFA_ENC_KEY = 'a'.repeat(64) }) // 32 bytes hex

  it('round-trips a secret', () => {
    const enc = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(enc).not.toContain('JBSWY3DPEHPK3PXP')
    expect(decryptSecret(enc)).toBe('JBSWY3DPEHPK3PXP')
  })

  it('produces different ciphertext each call (random IV)', () => {
    expect(encryptSecret('X')).not.toBe(encryptSecret('X'))
  })

  it('throws on tampered ciphertext', () => {
    const enc = encryptSecret('secret')
    const tampered = enc.slice(0, -2) + (enc.endsWith('A') ? 'B' : 'A')
    expect(() => decryptSecret(tampered)).toThrow()
  })
})
