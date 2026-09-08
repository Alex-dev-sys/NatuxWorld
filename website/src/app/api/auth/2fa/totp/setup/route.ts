import { NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@/lib/db'
import { apiError, authenticatedUser, consumeSecondFactor } from '@/lib/auth'
import { generateTotpSecret, otpauthUri } from '@/lib/totp'
import { encryptSecret } from '@/lib/twofaCrypto'

export const dynamic = 'force-dynamic'

/** Enrollment window for a pending secret; abandoned QR screens expire on their own. */
const PENDING_TOTP_TTL_MS = 15 * 60 * 1000

export async function POST(req: NextRequest) {
  const user = await authenticatedUser(req.headers)
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)
  const userId = user.id

  // With 2FA already enabled, a stolen bearer JWT must not be able to swap in
  // its own secret (that would hand over the account's second factor). Confirm
  // the CURRENT factor first — whichever method the account actually uses.
  if (user.twoFactorEnabled) {
    const body = (await req.json().catch(() => ({}))) as unknown
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined
    if (typeof code !== 'string' || !(await consumeSecondFactor(user, code))) {
      return apiError('bad_credentials', 'Подтвердите смену текущим кодом двухфакторной защиты', 401)
    }
  }

  const secret = generateTotpSecret()
  // Pending only: the active secret is replaced by /enable, never here, so
  // abandoning this screen leaves the existing authenticator working.
  await prisma.user.update({
    where: { id: userId },
    data: {
      pendingTotpSecretEnc: encryptSecret(secret),
      pendingTotpExpires: new Date(Date.now() + PENDING_TOTP_TTL_MS),
    },
  })

  const uri = otpauthUri(user.username, secret)
  const qr = await QRCode.toDataURL(uri)
  return Response.json({ otpauthUri: uri, qr })
}
