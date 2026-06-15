import { NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { generateTotpSecret, otpauthUri } from '@/lib/totp'
import { encryptSecret } from '@/lib/twofaCrypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)

  const secret = generateTotpSecret()
  // Store as pending secret (enabled only after /enable confirms a code).
  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret) } })

  const uri = otpauthUri(user.username, secret)
  const qr = await QRCode.toDataURL(uri)
  return Response.json({ otpauthUri: uri, qr })
}
