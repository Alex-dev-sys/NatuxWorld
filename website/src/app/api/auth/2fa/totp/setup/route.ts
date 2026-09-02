import { NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@/lib/db'
import { apiError, authenticatedUser } from '@/lib/auth'
import { generateTotpSecret, otpauthUri, verifyTotp } from '@/lib/totp'
import { encryptSecret, decryptSecret } from '@/lib/twofaCrypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await authenticatedUser(req.headers)
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)
  const userId = user.id

  // With 2FA already enabled, a stolen bearer JWT must not be able to swap in
  // its own secret (that would hand over the account's second factor).
  // Require a fresh code from the CURRENT secret before issuing a new one.
  if (user.twoFactorEnabled && user.twoFactorMethod === 'totp' && user.totpSecretEnc) {
    const { code } = (await req.json().catch(() => ({}))) as { code?: string }
    const provided = (code ?? '').trim()
    const valid = /^\d{6}$/.test(provided) && verifyTotp(provided, decryptSecret(user.totpSecretEnc))
    if (!valid) return apiError('bad_credentials', 'Введите текущий код из приложения', 401)
  }

  const secret = generateTotpSecret()
  // Store as pending secret (enabled only after /enable confirms a code).
  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret) } })

  const uri = otpauthUri(user.username, secret)
  const qr = await QRCode.toDataURL(uri)
  return Response.json({ otpauthUri: uri, qr })
}
