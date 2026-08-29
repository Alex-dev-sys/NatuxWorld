import { describe, it, expect, beforeEach } from 'vitest'
import { signChallenge, verifyChallenge } from '@/lib/twofaChallenge'

describe('twofaChallenge', () => {
  beforeEach(() => { process.env.JWT_SECRET = 'x'.repeat(40) })

  it('round-trips the userId', () => {
    const t = signChallenge('u_1')
    expect(verifyChallenge(t)).toBe('u_1')
  })

  it('rejects a tampered token', () => {
    const t = signChallenge('u_1')
    expect(verifyChallenge(t + 'z')).toBeNull()
  })

  it('rejects a normal session JWT (wrong purpose)', async () => {
    const { signToken } = await import('@/lib/auth')
    const session = signToken('u_1', 0)
    expect(verifyChallenge(session)).toBeNull()
  })
})
