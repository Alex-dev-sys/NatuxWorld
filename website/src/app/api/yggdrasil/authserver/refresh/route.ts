import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { buildProfile, randomToken } from '@/lib/yggdrasil'
import { isUsableGameToken, hashGameToken } from '@/lib/gameTokens'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 }) }

  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })
  }
  const { accessToken, clientToken } = body as Record<string, unknown>
  if (typeof accessToken !== 'string' || !accessToken) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })
  }
  if (clientToken !== undefined && typeof clientToken !== 'string') {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })
  }

  // Tokens are stored as sha256 digests; hash the presented raw value.
  const accessTokenHash = hashGameToken(accessToken)
  const old = await prisma.gameToken.findUnique({ where: { accessToken: accessTokenHash } })
  if (!old) return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })
  if (clientToken && old.clientToken !== clientToken) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({ where: { id: old.userId } })
  if (!user || !isUsableGameToken(old, user)) {
    await prisma.gameToken.deleteMany({ where: { accessToken: accessTokenHash } })
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })
  }

  // Only the digest is persisted; the raw token goes to the client below.
  const newToken = randomToken()
  await prisma.$transaction([
    prisma.gameToken.delete({ where: { accessToken: accessTokenHash } }),
    prisma.gameToken.create({
      data: {
        accessToken: hashGameToken(newToken),
        clientToken: old.clientToken,
        userId: old.userId,
        tokenVersion: user.tokenVersion,
      },
    }),
  ])

  const profile = buildProfile(user.username)
  return Response.json({ accessToken: newToken, clientToken: old.clientToken, selectedProfile: profile })
}
