import { prisma } from '@/lib/db'

const DEFAULT_TTL_HOURS = 24

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
