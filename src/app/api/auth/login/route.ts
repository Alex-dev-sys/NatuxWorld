import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { signToken, formatUser, apiError, logLoginEvent } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const userAgent = req.headers.get('user-agent') ?? ''

  let body: unknown
  try { body = await req.json() } catch {
    return apiError('bad_credentials', 'Неверный логин или пароль', 401)
  }
  const { login, password } = body as Record<string, string>
  if (!login || !password) return apiError('bad_credentials', 'Неверный логин или пароль', 401)

  if (!rateLimit(`login:${ip}:${login}`, 10, 60_000)) {
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

  if (!user.emailVerified) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('email_unverified', 'Подтвердите email', 403)
  }

  await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'login' })
  const token = signToken(user.id)
  return Response.json({ token, user: formatUser(user) })
}
