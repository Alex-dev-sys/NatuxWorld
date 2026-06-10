import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { generateCode, codeExpiry, sendVerificationEmail, apiError } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  let body: unknown
  try { body = await req.json() } catch { return apiError('not_found', 'Аккаунт не найден', 404) }
  const { email } = body as Record<string, string>
  if (!email) return apiError('not_found', 'Аккаунт не найден', 404)

  if (!rateLimit(`resend:${ip}:${email}`, 3, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return apiError('not_found', 'Аккаунт не найден', 404)

  const code = generateCode()
  await prisma.user.update({
    where: { email },
    data: { verifyCode: code, verifyCodeExpires: codeExpiry() },
  })

  try {
    await sendVerificationEmail(email, code)
  } catch (err) {
    console.error('Email send failed:', err)
  }

  return Response.json({ status: 'verification_sent' })
}
