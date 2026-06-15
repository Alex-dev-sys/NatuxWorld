import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { generateBackupCodes, hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.emailVerified) return apiError('email_unverified', 'Подтвердите email', 403)

  const codes = generateBackupCodes()
  await prisma.$transaction([
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorMethod: 'email', totpSecretEnc: null, tokenVersion: { increment: 1 } },
    }),
  ])
  return Response.json({ ok: true, backupCodes: codes })
}
