import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: { gameToken: { deleteMany: vi.fn() } } }))

import { isUsableGameToken } from '@/lib/gameTokens'

const user = { tokenVersion: 2, emailVerified: true, bannedAt: null }

describe('game token policy', () => {
  it('accepts a current token bound to the current session generation', () => {
    expect(isUsableGameToken({ createdAt: new Date(), tokenVersion: 2 }, user)).toBe(true)
  })

  it('rejects tokens after global session revocation', () => {
    expect(isUsableGameToken({ createdAt: new Date(), tokenVersion: 1 }, user)).toBe(false)
  })

  it('rejects expired and banned sessions', () => {
    const expired = new Date(Date.now() - 25 * 60 * 60 * 1000)
    expect(isUsableGameToken({ createdAt: expired, tokenVersion: 2 }, user)).toBe(false)
    expect(isUsableGameToken(
      { createdAt: new Date(), tokenVersion: 2 },
      { ...user, bannedAt: new Date() },
    )).toBe(false)
  })
})
