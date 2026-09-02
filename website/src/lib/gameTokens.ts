import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'

const DEFAULT_TTL_HOURS = 24
const MAX_ACTIVE_TOKENS = 10

/** Game tokens are random hex; only their sha256 is ever persisted. */
export function hashGameToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function gameTokenTtlMs(): number {
  const configured = Number(process.env.GAME_TOKEN_TTL_HOURS ?? DEFAULT_TTL_HOURS)
  const hours = Number.isFinite(configured)
    ? Math.min(Math.max(Math.floor(configured), 1), 24 * 30)
    : DEFAULT_TTL_HOURS
  return hours * 60 * 60 * 1000
}

export function gameTokenCutoff(now = Date.now()): Date {
  return new Date(now - gameTokenTtlMs())
}

export function isUsableGameToken(
  token: { createdAt: Date; tokenVersion: number },
  user: { tokenVersion: number; emailVerified: boolean; bannedAt: Date | null },
  now = Date.now(),
): boolean {
  return token.createdAt >= gameTokenCutoff(now) &&
    token.tokenVersion === user.tokenVersion &&
    user.emailVerified &&
    !user.bannedAt
}

/** Opportunistic cleanup keeps the session table bounded without a cron dependency. */
export async function deleteExpiredGameTokens(userId?: string): Promise<void> {
  await prisma.gameToken.deleteMany({
    where: {
      ...(userId ? { userId } : {}),
      createdAt: { lt: gameTokenCutoff() },
    },
  })
}

/**
 * Caps the number of concurrently active tokens per user so a stolen session
 * cannot mint an unbounded farm of game credentials. Keeps the MAX_ACTIVE_TOKENS
 * most recent tokens.
 */
export async function pruneExcessGameTokens(userId: string, max = MAX_ACTIVE_TOKENS): Promise<void> {
  const overflow = await prisma.gameToken.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: max,
    select: { createdAt: true },
  })
  if (overflow.length === 0) return
  await prisma.gameToken.deleteMany({
    where: { userId, createdAt: { lte: overflow[overflow.length - 1].createdAt } },
  })
}
