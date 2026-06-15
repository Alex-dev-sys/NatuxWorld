import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/clientIp'
import { isLockedOut } from '@/lib/lockout'
import { signToken, formatUser, apiError, logLoginEvent } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent') ?? ''

  let body: unknown
  try { body = await req.json() } catch {
    return apiError('bad_credentials', 'Неверный логин или пароль', 401)
  }
  const { login, password } = body as Record<string, string>
  if (!login || !password) return apiError('bad_credentials', 'Неверный логин или пароль', 401)

  // IP-wide bucket caps password spraying; per-(ip, account) bucket caps targeted
  // brute force. Identifier normalized so casing/whitespace can't open fresh buckets.
  const acct = login.toLowerCase().trim()
  if (!rateLimit(`login:ip:${ip}`, 30, 60_000) || !rateLimit(`login:${ip}:${acct}`, 10, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  const isEmail = login.includes('@')
  const user = await prisma.user.findUnique({
    where: isEmail ? { email: login } : { username: login },
  })
  if (!user) {
    await logLoginEvent({ ip, userAgent, kind: 'fail' })
    return apiError('bad_credentials', 'Неверный логин или пароль', 401)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('bad_credentials', 'Неверный логин или пароль', 401)
  }

  // Account-wide lockout: too many recent failures (possibly from many IPs) blocks
  // even a correct password until the window clears.
  if (await isLockedOut(user.id)) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('rate_limited', 'Слишком много попыток, попробуйте позже', 429)
  }

  if (!user.emailVerified) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('email_unverified', 'Подтвердите email', 403)
  }

  await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'login' })
  const token = signToken(user.id, user.tokenVersion)
  return Response.json({ token, user: formatUser(user) })
}
