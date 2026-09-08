import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { sessionIdOf, verifySessionToken } from '@/lib/adminSession'

/**
 * Authoritative admin check (Node runtime). Beyond the signature and expiry it
 * requires the session to still exist server-side, so a logged-out cookie stays
 * dead across restarts and redeploys.
 */
export async function requireAdmin(req: NextRequest): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET
  const token = req.cookies.get('admin_session')?.value
  if (!secret || !token) return false
  if (!(await verifySessionToken(token, secret))) return false

  const sid = sessionIdOf(token)
  if (!sid) return false
  const session = await prisma.adminSession
    .findUnique({ where: { sid } })
    .catch(() => null)
  return !!session && session.expiresAt > new Date()
}

/** Registers a freshly issued session so it can later be revoked for real. */
export async function createAdminSession(sid: string, ttlSeconds: number): Promise<void> {
  const now = new Date()
  await prisma.adminSession.create({
    data: { sid, expiresAt: new Date(now.getTime() + ttlSeconds * 1000) },
  })
  // Opportunistic cleanup keeps the table bounded without a cron dependency.
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {})
}

/**
 * Ends a session server-side; the cookie is worthless afterwards. Throws when
 * the revocation did not happen — swallowing that reported a successful logout
 * while a saved copy of the cookie kept working once the database came back.
 */
export async function revokeAdminSession(token: string): Promise<void> {
  const sid = sessionIdOf(token)
  // A malformed token names no session; nothing to revoke, and nothing works
  // with it either.
  if (!sid) return
  await prisma.adminSession.deleteMany({ where: { sid } })
}
