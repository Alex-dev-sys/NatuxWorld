import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, apiError } from '@/lib/auth'
import { offlineUuid, randomToken } from '@/lib/yggdrasil'
import { deleteExpiredGameTokens, hashGameToken, pruneExcessGameTokens } from '@/lib/gameTokens'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!bearer) return apiError('unauthorized', 'Требуется JWT токен', 401)

  let claims: { sub: string; tv: number }
  try { claims = verifyToken(bearer) } catch { return apiError('token_invalid', 'Сессия истекла', 401) }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } })
  if (!user || !user.emailVerified || user.bannedAt || user.tokenVersion !== claims.tv) {
    return apiError('unauthorized', 'Аккаунт не верифицирован', 403)
  }

  const accessToken = randomToken()
  const clientToken = randomToken()
  await deleteExpiredGameTokens(user.id)
  await prisma.gameToken.create({
    // Only the sha256 of the access token is persisted; the raw value goes to
    // the client in the response below.
    data: { accessToken: hashGameToken(accessToken), clientToken, userId: user.id, tokenVersion: user.tokenVersion },
  })
  await pruneExcessGameTokens(user.id)

  return Response.json({
    accessToken,
    clientToken,
    uuid: offlineUuid(user.username),
    username: user.username,
  })
}
