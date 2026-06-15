import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { signToken, formatUser, apiError, logLoginEvent } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const userAgent = req.headers.get('user-agent') ?? ''

  let body: unknown
  try { body = await req.json() } catch {
    return apiError('validation_failed', 'Проверьте правильность данных', 422)
  }
  const { email, code } = body as Record<string, string>
  if (!email || !code) return apiError('code_invalid', 'Неверный код', 400)

  if (!rateLimit(`verify:${ip}:${email}`, 5, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.verifyCode) {
    await logLoginEvent({ ip, userAgent, kind: 'fail' })
    return apiError('code_invalid', 'Неверный код', 400)
  }

  if (user.verifyCodeExpires && user.verifyCodeExpires < new Date()) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('code_expired', 'Код истёк, запросите новый', 410)
  }

  if (user.verifyCode !== code) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('code_invalid', 'Неверный код', 400)
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { emailVerified: true, verifyCode: null, verifyCodeExpires: null },
  })

  await logLoginEvent({ userId: updated.id, ip, userAgent, kind: 'verify' })
  const token = signToken(updated.id, updated.tokenVersion)
  return Response.json({ token, user: formatUser(updated) })
}
