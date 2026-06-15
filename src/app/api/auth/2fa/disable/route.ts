import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { verifyTotp } from '@/lib/totp'
import { decryptSecret } from '@/lib/twofaCrypto'
import { hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const { password, code } = (await req.json().catch(() => ({}))) as { password?: string; code?: string }
  if (!password || !code) return apiError('bad_request', 'Пароль и код обязательны', 400)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.twoFactorEnabled) return apiError('bad_request', '2FA не включена', 400)
  if (!(await bcrypt.compare(password, user.passwordHash))) return apiError('bad_credentials', 'Неверный пароль', 401)

  let ok = user.twoFactorMethod === 'totp' && !!user.totpSecretEnc && verifyTotp(code, decryptSecret(user.totpSecretEnc))
  if (!ok && user.twoFactorMethod === 'email') {
    ok = !!user.twoFactorCode && !!user.twoFactorCodeExpires && user.twoFactorCodeExpires > new Date() && user.twoFactorCode === hashBackupCode(code)
  }
  if (!ok) {
    const match = await prisma.twoFactorBackupCode.findFirst({ where: { userId, codeHash: hashBackupCode(code), usedAt: null } })
    ok = !!match
  }
  if (!ok) return apiError('bad_credentials', 'Неверный код', 401)

  await prisma.$transaction([
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorMethod: null, totpSecretEnc: null, twoFactorCode: null, twoFactorCodeExpires: null, tokenVersion: { increment: 1 } },
    }),
  ])
  return Response.json({ ok: true })
}
