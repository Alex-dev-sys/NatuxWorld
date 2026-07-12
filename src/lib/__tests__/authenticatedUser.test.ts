import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique } } }))

import { authenticatedUser, signToken } from '@/lib/auth'

function headers(token: string) {
  return new Headers({ authorization: `Bearer ${token}` })
}

const activeUser = {
  id: 'u1', tokenVersion: 3, emailVerified: true, bannedAt: null,
}

describe('authenticatedUser', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long'
    findUnique.mockReset()
  })

  it('accepts an active session generation', async () => {
    findUnique.mockResolvedValue(activeUser)
    expect((await authenticatedUser(headers(signToken('u1', 3))))?.id).toBe('u1')
  })

  it('rejects revoked and banned sessions', async () => {
    findUnique.mockResolvedValue(activeUser)
    expect(await authenticatedUser(headers(signToken('u1', 2)))).toBeNull()
    findUnique.mockResolvedValue({ ...activeUser, bannedAt: new Date() })
    expect(await authenticatedUser(headers(signToken('u1', 3)))).toBeNull()
  })
})
