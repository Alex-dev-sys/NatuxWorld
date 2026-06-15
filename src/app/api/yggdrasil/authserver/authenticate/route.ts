import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { buildProfile, randomToken } from '@/lib/yggdrasil'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/clientIp'
import { isLockedOut } from '@/lib/lockout'
import { logLoginEvent } from '@/lib/auth'
import { verifyAppPassword } from '@/lib/appPassword'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials' }, { status: 403 }) }

  const { username, password, clientToken, requestUser } = body as Record<string, string>
  if (!username || !password) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials' }, { status: 403 })
  }

  const ip = clientIp(req)
  // Two independent buckets: IP-wide cap stops password spraying across many accounts;
  // per-(ip, account) cap stops targeted brute force. Identifier normalized so
  // "Admin"/"admin"/" admin " cannot each open a fresh bucket against one account.
  const acct = username.toLowerCase().trim()
  if (!rateLimit(`ygg-auth:ip:${ip}`, 30, 60_000) || !rateLimit(`ygg-auth:${ip}:${acct}`, 10, 60_000)) {
    return Response.json(
      { error: 'ForbiddenOperationException', errorMessage: 'Too many requests' },
      { status: 429 },
    )
  }

  const isEmail = username.includes('@')
  const user = await prisma.user.findUnique({
    where: isEmail ? { email: username } : { username },
  })
  if (!user || !user.emailVerified) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials' }, { status: 403 })
  }

  // 2FA users must use a generated app-password here; the main password is NOT
  // accepted on this endpoint (the vanilla MC client cannot prompt for a TOTP code).
  let valid: boolean
  if (user.twoFactorEnabled) {
    const aps = await prisma.appPassword.findMany({ where: { userId: user.id }, select: { hash: true } })
    valid = await verifyAppPassword(password, aps.map((a) => a.hash))
    if (valid) {
      await prisma.appPassword.updateMany({ where: { userId: user.id }, data: { lastUsedAt: new Date() } })
    }
  } else {
    valid = await bcrypt.compare(password, user.passwordHash)
  }
  if (!valid) {
    await logLoginEvent({ userId: user.id, ip, userAgent: req.headers.get('user-agent') ?? '', kind: 'fail' })
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials' }, { status: 403 })
  }

  // Account-wide lockout shared with /login — failures via either endpoint count together.
  if (await isLockedOut(user.id)) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Account temporarily locked' }, { status: 429 })
  }

  const accessToken = randomToken()
  const resolvedClientToken = clientToken ?? randomToken()

  await prisma.gameToken.create({
    data: { accessToken, clientToken: resolvedClientToken, userId: user.id },
  })

  const profile = buildProfile(user.username)
  const resp: Record<string, unknown> = {
    accessToken,
    clientToken: resolvedClientToken,
    availableProfiles: [profile],
    selectedProfile: profile,
  }
  if (requestUser) resp.user = { id: user.id, username: user.username }
  return Response.json(resp)
}
