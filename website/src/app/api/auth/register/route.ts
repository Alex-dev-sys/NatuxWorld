import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { generateCode, codeExpiry, sendVerificationEmail, apiError, logLoginEvent } from '@/lib/auth'
import { clientIp } from '@/lib/clientIp'

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent') ?? ''

  if (!rateLimit(`register:${ip}`, 5, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  let body: unknown
  try { body = await req.json() } catch {
    return apiError('validation_failed', 'Проверьте правильность данных', 422)
  }
  const { username, email, password } = body as Record<string, string>

  if (!username || !email || !password ||
      !USERNAME_RE.test(username) ||
      !EMAIL_RE.test(email) ||
      password.length < 8) {
    await logLoginEvent({ ip, userAgent, kind: 'fail' })
    return apiError('validation_failed', 'Проверьте правильность данных', 422)
  }

  const [existingUsername, existingEmail] = await Promise.all([
    prisma.user.findUnique({ where: { username } }),
    prisma.user.findUnique({ where: { email } }),
  ])
  if (existingUsername) {
    await logLoginEvent({ ip, userAgent, kind: 'fail' })
    return apiError('username_taken', 'Этот ник уже занят', 409)
  }
  if (existingEmail) {
    await logLoginEvent({ ip, userAgent, kind: 'fail' })
    return apiError('email_taken', 'Эта почта уже зарегистрирована', 409)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const code = generateCode()
  const expires = codeExpiry()

  const user = await prisma.user.create({
    data: {
      id: `u_${nanoid()}`,
      username,
      email,
      passwordHash,
      emailVerified: false,
      verifyCode: code,
      verifyCodeExpires: expires,
    },
  })

  await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'register' })

  try {
    await sendVerificationEmail(email, code)
  } catch (err) {
    console.error('Email send failed:', err)
  }

  return Response.json({ status: 'verification_sent', email })
}
