import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { buildProfile } from '@/lib/yggdrasil'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const username = searchParams.get('username')
  const serverId = searchParams.get('serverId')
  if (!username || !serverId) return new Response(null, { status: 204 })

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return new Response(null, { status: 204 })

  const token = await prisma.gameToken.findFirst({
    where: { serverId, userId: user.id },
  })
  if (!token) return new Response(null, { status: 204 })

  return Response.json(buildProfile(user.username))
}
