import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { apiError, authenticatedUser } from '@/lib/auth'
import { generateBackupCodes, hashBackupCode } from '@/lib/backupCodes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await authenticatedUser(req.headers)
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)
  const userId = user.id

  // Changing an already configured factor is a destructive step-up action.
  // A bearer token alone must never be sufficient to replace TOTP or rotate
  // backup codes.
  if (user.twoFactorEnabled) {
    const body = (await req.json().catch(() => ({}))) as { password?: string; code?: string }
    const passwordOk = typeof body.password === 'string' && body.password.length <= 200 && await bcrypt.compare(body.password, user.passwordHash)
    if (!passwordOk) return apiError('bad_credentials', 'Подтвердите действие паролем', 401)
  }

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
