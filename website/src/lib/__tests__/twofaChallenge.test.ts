import { describe, it, expect, beforeEach } from 'vitest'
import { signChallenge, verifyChallenge } from '@/lib/twofaChallenge'

describe('twofaChallenge', () => {
  beforeEach(() => { process.env.JWT_SECRET = 'x'.repeat(40) })

  it('round-trips the userId and credential version', () => {
    const t = signChallenge('u_1', 3)
    expect(verifyChallenge(t)).toEqual({ userId: 'u_1', tokenVersion: 3 })
  })

  it('rejects a tampered token', () => {
    const t = signChallenge('u_1', 0)
    expect(verifyChallenge(t + 'z')).toBeNull()
  })

  it('rejects a normal session JWT (wrong purpose)', async () => {
    const { signToken } = await import('@/lib/auth')
    const session = signToken('u_1', 0)
    expect(verifyChallenge(session)).toBeNull()
  })
})
