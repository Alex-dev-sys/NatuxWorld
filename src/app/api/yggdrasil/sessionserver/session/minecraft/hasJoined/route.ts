import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { buildProfile } from '@/lib/yggdrasil'
import { gameTokenCutoff, isUsableGameToken } from '@/lib/gameTokens'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const username = searchParams.get('username')
  const serverId = searchParams.get('serverId')
  if (!username || !serverId) return new Response(null, { status: 204 })

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user || user.bannedAt || !user.emailVerified) return new Response(null, { status: 204 })

  const token = await prisma.gameToken.findFirst({
    where: { serverId, userId: user.id, createdAt: { gte: gameTokenCutoff() } },
  })
  if (!token || !isUsableGameToken(token, user)) return new Response(null, { status: 204 })

  return Response.json(buildProfile(user.username))
}
