import { describe, it, expect, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
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

  it('rejects a purpose-bound 2FA challenge used as a session token', () => {
    const secret = 'test-secret-at-least-32-chars-long-xxxx'
    const challenge = jwt.sign({ sub: 'u_2fa', purpose: '2fa' }, secret, { expiresIn: '5m' })
    expect(() => verifyToken(challenge)).toThrow()
  })

  it('rejects a session token without a numeric tv claim', () => {
    const secret = 'test-secret-at-least-32-chars-long-xxxx'
    const legacy = jwt.sign({ sub: 'u_legacy' }, secret, { expiresIn: '1h' })
    expect(() => verifyToken(legacy)).toThrow()
  })
})
