import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { apiError, authenticatedUser } from '@/lib/auth'
import { verifyTotp } from '@/lib/totp'
import { decryptSecret } from '@/lib/twofaCrypto'
import { hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await authenticatedUser(req.headers)
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)
  const userId = user.id
  const { password, code } = (await req.json().catch(() => ({}))) as { password?: string; code?: string }
  if (!password || !code) return apiError('bad_request', 'Пароль и код обязательны', 400)
  if (!user.twoFactorEnabled) return apiError('bad_request', '2FA не включена', 400)
  if (!(await bcrypt.compare(password, user.passwordHash))) return apiError('bad_credentials', 'Неверный пароль', 401)

  const isTotp = user.twoFactorMethod === 'totp' && !!user.totpSecretEnc && verifyTotp(code, decryptSecret(user.totpSecretEnc))
  const isEmailCode = user.twoFactorMethod === 'email' && !!user.twoFactorCode && !!user.twoFactorCodeExpires &&
    user.twoFactorCodeExpires > new Date() && user.twoFactorCode === hashBackupCode(code)

  try {
    await prisma.$transaction(async (tx) => {
      if (!isTotp && !isEmailCode) {
        const consumed = await tx.twoFactorBackupCode.updateMany({
          where: { userId, codeHash: hashBackupCode(code), usedAt: null },
          data: { usedAt: new Date() },
        })
        if (consumed.count !== 1) throw new Error('invalid backup code')
      }
      await tx.twoFactorBackupCode.deleteMany({ where: { userId } })
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorMethod: null,
          totpSecretEnc: null,
          twoFactorCode: null,
          twoFactorCodeExpires: null,
          tokenVersion: { increment: 1 },
        },
      })
    })
  } catch {
    return apiError('bad_credentials', 'Неверный код', 401)
  }
  return Response.json({ ok: true })
}
