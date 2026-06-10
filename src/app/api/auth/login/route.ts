import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { signToken, formatUser, apiError } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  let body: unknown
  try { body = await req.json() } catch { return apiError('bad_credentials', 'Неверный логин или пароль', 401) }
  const { login, password } = body as Record<string, string>
  if (!login || !password) return apiError('bad_credentials', 'Неверный логин или пароль', 401)

  if (!rateLimit(`login:${ip}:${login}`, 10, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  const isEmail = login.includes('@')
  const user = await prisma.user.findUnique({
    where: isEmail ? { email: login } : { username: login },
  })
  if (!user) return apiError('bad_credentials', 'Неверный логин или пароль', 401)

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return apiError('bad_credentials', 'Неверный логин или пароль', 401)

  if (!user.emailVerified) return apiError('email_unverified', 'Подтвердите email', 403)

  const token = signToken(user.id)
  return Response.json({ token, user: formatUser(user) })
}
