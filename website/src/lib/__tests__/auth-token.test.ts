import { describe, it, expect, beforeEach } from 'vitest'
import { signToken, verifyToken } from '@/lib/auth'

describe('signToken / verifyToken with tokenVersion', () => {
  beforeEach(() => { process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-xxxx' })

  it('round-trips the user id and token version', () => {
    const token = signToken('u_abc', 3)
    const payload = verifyToken(token)
    expect(payload.sub).toBe('u_abc')
    expect(payload.tv).toBe(3)
  })

  it('defaults tv to 0 when not provided', () => {
    const token = signToken('u_def')
    expect(verifyToken(token).tv).toBe(0)
  })

  it('throws on a tampered token', () => {
    const token = signToken('u_ghi', 0)
    expect(() => verifyToken(token + 'x')).toThrow()
  })
})
