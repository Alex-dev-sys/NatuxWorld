import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { signToken, formatUser, apiError, logLoginEvent } from '@/lib/auth'
import { clientIp } from '@/lib/clientIp'
import { rateLimit } from '@/lib/ratelimit'
import { isLockedOut } from '@/lib/lockout'
import { verifyChallenge } from '@/lib/twofaChallenge'
import { verifyTotp } from '@/lib/totp'
import { decryptSecret } from '@/lib/twofaCrypto'
import { hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent') ?? ''

  let body: { challenge?: string; code?: string }
  try { body = await req.json() } catch { return apiError('bad_request', 'Некорректный запрос', 400) }
  const { challenge, code } = body
  if (!challenge || !code) return apiError('bad_request', 'Код обязателен', 400)

  const userId = verifyChallenge(challenge)
  if (!userId) return apiError('token_invalid', 'Сессия подтверждения истекла', 401)

  // The 6-digit space is small; cap attempts hard.
  if (!rateLimit(`2fa:ip:${ip}`, 30, 60_000) || !rateLimit(`2fa:${ip}:${userId}`, 6, 60_000)) {
    return apiError('rate_limited', 'Слишком много попыток, подождите', 429)
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.twoFactorEnabled || !user.emailVerified || user.bannedAt) {
    return apiError('unauthorized', 'Недоступно', 403)
  }
  if (await isLockedOut(user.id)) return apiError('rate_limited', 'Слишком много попыток, попробуйте позже', 429)

  const trimmed = code.trim()
  let ok = false

  if (user.twoFactorMethod === 'totp' && user.totpSecretEnc) {
    ok = verifyTotp(trimmed, decryptSecret(user.totpSecretEnc))
  } else if (user.twoFactorMethod === 'email') {
    ok = !!user.twoFactorCode && !!user.twoFactorCodeExpires &&
      user.twoFactorCodeExpires > new Date() &&
      user.twoFactorCode === hashBackupCode(trimmed)
  }

  // Backup code fallback (works for either method).
  if (!ok) {
    const consumed = await prisma.twoFactorBackupCode.updateMany({
      where: { userId: user.id, codeHash: hashBackupCode(trimmed), usedAt: null },
      data: { usedAt: new Date() },
    })
    ok = consumed.count === 1
  }

  if (!ok) {
    await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'fail' })
    return apiError('bad_credentials', 'Неверный код', 401)
  }

  // Clear any consumed email OTP.
  if (user.twoFactorCode) {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorCode: null, twoFactorCodeExpires: null } })
  }
  await logLoginEvent({ userId: user.id, ip, userAgent, kind: 'login' })
  return Response.json({ token: signToken(user.id, user.tokenVersion), user: formatUser(user) })
}
