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

  if (!user.twoFactorEnabled) return apiError('bad_request', '2FA не включена', 400)

  let ok = user.twoFactorMethod === 'totp' && !!user.totpSecretEnc && verifyTotp(code, decryptSecret(user.totpSecretEnc))
  if (!ok) {
    const match = await prisma.twoFactorBackupCode.findFirst({ where: { userId, codeHash: hashBackupCode(code), usedAt: null } })
    ok = !!match
  }
  if (!ok) return apiError('bad_credentials', 'Неверный код', 401)

  const codes = generateBackupCodes()
  await prisma.$transaction([
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
  ])
  return Response.json({ ok: true, backupCodes: codes })
}
