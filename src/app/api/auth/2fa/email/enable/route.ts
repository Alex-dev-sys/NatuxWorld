import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, authenticatedUser } from '@/lib/auth'
import { generateBackupCodes, hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await authenticatedUser(req.headers)
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)
  const userId = user.id

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
