import { prisma } from '@/lib/db'

/** Number of recent failures that triggers a temporary account lockout. */
export const LOCKOUT_THRESHOLD = 10
/** Sliding window (ms) over which failures are counted. */
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000

/** True when this user has hit the failure threshold within the window. */
export async function isLockedOut(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS)
  const fails = await prisma.loginEvent.count({
    where: { userId, kind: 'fail', createdAt: { gte: since } },
  })
  return fails >= LOCKOUT_THRESHOLD
}
