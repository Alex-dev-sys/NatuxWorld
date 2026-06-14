import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { offlineUuid } from '@/lib/yggdrasil'
import { logLoginEvent } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  let body: unknown
  try { body = await req.json() } catch { return new Response(null, { status: 403 }) }

  const { accessToken, selectedProfile, serverId } = body as Record<string, string>
  if (!accessToken || !selectedProfile || !serverId) return new Response(null, { status: 403 })

  const token = await prisma.gameToken.findUnique({ where: { accessToken } })
  if (!token) return new Response(null, { status: 403 })

  const user = await prisma.user.findUnique({ where: { id: token.userId } })
  if (!user) return new Response(null, { status: 403 })

  // Verify that the profile UUID matches this user's offline UUID.
  if (offlineUuid(user.username) !== selectedProfile) return new Response(null, { status: 403 })

  await prisma.gameToken.update({ where: { accessToken }, data: { serverId } })
  await logLoginEvent({ userId: user.id, ip, userAgent: req.headers.get('user-agent') ?? '', kind: 'join' })

  return new Response(null, { status: 204 })
}
