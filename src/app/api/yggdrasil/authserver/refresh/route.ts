import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { buildProfile, randomToken } from '@/lib/yggdrasil'
import { isUsableGameToken } from '@/lib/gameTokens'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 }) }

  const { accessToken, clientToken } = body as Record<string, string>
  if (!accessToken) return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })

  const old = await prisma.gameToken.findUnique({ where: { accessToken } })
  if (!old) return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })
  if (clientToken && old.clientToken !== clientToken) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({ where: { id: old.userId } })
  if (!user || !isUsableGameToken(old, user)) {
    await prisma.gameToken.deleteMany({ where: { accessToken } })
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid token' }, { status: 403 })
  }

  const newToken = randomToken()
  await prisma.$transaction([
    prisma.gameToken.delete({ where: { accessToken } }),
    prisma.gameToken.create({
      data: {
        accessToken: newToken,
        clientToken: old.clientToken,
        userId: old.userId,
        tokenVersion: user.tokenVersion,
      },
    }),
  ])

  const profile = buildProfile(user.username)
  return Response.json({ accessToken: newToken, clientToken: old.clientToken, selectedProfile: profile })
}
