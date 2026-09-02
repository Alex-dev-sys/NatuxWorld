import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { signToken, formatUser, apiError, logLoginEvent } from '@/lib/auth'
import { hashBackupCode } from '@/lib/backupCodes'
import { clientIp } from '@/lib/clientIp'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent') ?? ''

  let body: unknown
  try { body = await req.json() } catch {
    return apiError('validation_failed', 'Проверьте правильность данных', 422)
  }
  const email = typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : ''
  const code = typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
    ? body.code.trim()
    : ''
  if (!email || !code) return apiError('code_invalid', 'Неверный код', 400)

  if (!rateLimit(`verify:${ip}:${email}`, 5, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  })
  if (!user || user.emailVerified || !user.verifyCode) {
    await logLoginEvent({ ip, userAgent, kind: 'fail' })
    return apiError('code_invalid', 'Неверный код', 400)
  }

  if (user.verifyCodeExpires && user.verifyCodeExpires < new Date()) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('code_expired', 'Код истёк, запросите новый', 410)
  }

  // Stored codes are sha256 digests (see register/resend-code).
  if (user.verifyCode !== hashBackupCode(code)) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('code_invalid', 'Неверный код', 400)
  }

  // Consume the code and verify the account in one conditional write. This
  // prevents two concurrent requests from both receiving a session.
  const consumed = await prisma.user.updateMany({
    where: {
      id: user.id,
      emailVerified: false,
      verifyCode: hashBackupCode(code),
      verifyCodeExpires: { gt: new Date() },
    },
    data: { emailVerified: true, verifyCode: null, verifyCodeExpires: null },
  })
  if (consumed.count !== 1) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('code_invalid', 'Неверный код', 400)
  }

  const updated = await prisma.user.findUnique({ where: { id: user.id } })
  if (!updated) return apiError('code_invalid', 'Неверный код', 400)
  await logLoginEvent({ userId: updated.id, ip, userAgent, kind: 'verify' })
  const token = signToken(updated.id, updated.tokenVersion)
  return Response.json({ token, user: formatUser(updated) })
}
