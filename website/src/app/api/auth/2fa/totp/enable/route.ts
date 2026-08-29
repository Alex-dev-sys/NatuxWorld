import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, authenticatedUser } from '@/lib/auth'
import { verifyTotp } from '@/lib/totp'
import { decryptSecret } from '@/lib/twofaCrypto'
import { generateBackupCodes, hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await authenticatedUser(req.headers)
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)
  const userId = user.id
  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  if (!code) return apiError('bad_request', 'Код обязателен', 400)

  if (!user.totpSecretEnc) return apiError('bad_request', 'Сначала настройте приложение', 400)
  if (!verifyTotp(code, decryptSecret(user.totpSecretEnc))) return apiError('bad_credentials', 'Неверный код', 401)

  const codes = generateBackupCodes()
  await prisma.$transaction([
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorMethod: 'totp', tokenVersion: { increment: 1 } },
    }),
  ])
  return Response.json({ ok: true, backupCodes: codes })
}
