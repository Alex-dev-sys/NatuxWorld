import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const update = vi.fn()
const bcFindFirst = vi.fn()
const bcUpdate = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
    twoFactorBackupCode: {
      findFirst: (...a: unknown[]) => bcFindFirst(...a),
      update: (...a: unknown[]) => bcUpdate(...a),
    },
  },
}))
vi.mock('@/lib/lockout', () => ({ isLockedOut: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig() as object), logLoginEvent: vi.fn() }))

import { POST } from '@/app/api/auth/login/2fa/route'
import { signChallenge } from '@/lib/twofaChallenge'
import { generateTotpSecret } from '@/lib/totp'
import { encryptSecret } from '@/lib/twofaCrypto'
import { authenticator } from 'otplib'

function req(body: unknown) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
    json: async () => body,
  } as unknown as import('next/server').NextRequest
}

describe('POST /api/auth/login/2fa (TOTP)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'x'.repeat(40)
    process.env.TWOFA_ENC_KEY = 'a'.repeat(64)
    ;(globalThis as { __rateLimit?: unknown }).__rateLimit = undefined
    findUnique.mockReset(); update.mockReset(); update.mockResolvedValue({})
    bcFindFirst.mockReset(); bcFindFirst.mockResolvedValue(null)
  })

  it('issues a JWT for a valid TOTP code', async () => {
    const secret = generateTotpSecret()
    findUnique.mockResolvedValue({ id: 'u_1', username: 'u', email: 'e@e.com', emailVerified: true, bannedAt: null, tokenVersion: 0, twoFactorEnabled: true, twoFactorMethod: 'totp', totpSecretEnc: encryptSecret(secret), twoFactorCode: null })
    const res = await POST(req({ challenge: signChallenge('u_1'), code: authenticator.generate(secret) }))
    expect(res.status).toBe(200)
    expect((await res.json()).token).toBeTruthy()
  })

  it('rejects a wrong code', async () => {
    const secret = generateTotpSecret()
    findUnique.mockResolvedValue({ id: 'u_1', emailVerified: true, bannedAt: null, tokenVersion: 0, twoFactorEnabled: true, twoFactorMethod: 'totp', totpSecretEnc: encryptSecret(secret), twoFactorCode: null })
    const res = await POST(req({ challenge: signChallenge('u_1'), code: '000000' }))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid challenge', async () => {
    const res = await POST(req({ challenge: 'garbage', code: '123456' }))
    expect(res.status).toBe(401)
  })

  it('accepts an unused backup code', async () => {
    findUnique.mockResolvedValue({ id: 'u_1', username: 'u', email: 'e@e.com', emailVerified: true, bannedAt: null, tokenVersion: 0, twoFactorEnabled: true, twoFactorMethod: 'totp', totpSecretEnc: encryptSecret(generateTotpSecret()), twoFactorCode: null })
    bcFindFirst.mockResolvedValue({ id: 'bc1' })
    bcUpdate.mockResolvedValue({})
    const res = await POST(req({ challenge: signChallenge('u_1'), code: 'abcd-efgh' }))
    expect(res.status).toBe(200)
    expect(bcUpdate).toHaveBeenCalled() // marked used
  })
})
