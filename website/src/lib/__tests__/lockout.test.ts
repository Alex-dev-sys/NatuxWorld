import { describe, it, expect, vi, beforeEach } from 'vitest'

const count = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { loginEvent: { count: (...a: unknown[]) => count(...a) } } }))

import { isLockedOut, LOCKOUT_THRESHOLD } from '@/lib/lockout'

describe('isLockedOut', () => {
  beforeEach(() => count.mockReset())

  it('is not locked out below the threshold', async () => {
    count.mockResolvedValue(LOCKOUT_THRESHOLD - 1)
    expect(await isLockedOut('u_1')).toBe(false)
  })

  it('is locked out at the threshold', async () => {
    count.mockResolvedValue(LOCKOUT_THRESHOLD)
    expect(await isLockedOut('u_1')).toBe(true)
  })

  it('counts only fail events for that user within the window', async () => {
    count.mockResolvedValue(0)
    await isLockedOut('u_42')
    const arg = count.mock.calls[0][0] as { where: { userId: string; kind: string; createdAt: { gte: Date } } }
    expect(arg.where.userId).toBe('u_42')
    expect(arg.where.kind).toBe('fail')
    expect(arg.where.createdAt.gte).toBeInstanceOf(Date)
  })
})
