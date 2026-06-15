import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Plugin sends events here with GAME_API_KEY header
export async function POST(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  if (!key || key !== process.env.GAME_API_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    events: Array<{
      username: string
      kind: string
      message?: string
      world?: string
      x?: number; y?: number; z?: number
      extra?: string
    }>
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ error: 'No events' }, { status: 400 })
  }

  // Batch-resolve usernames to userIds
  const usernames = [...new Set(body.events.map(e => e.username))]
  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true },
  })
  const userMap = Object.fromEntries(users.map(u => [u.username, u.id]))

  await prisma.gameEvent.createMany({
    data: body.events.slice(0, 500).map(e => ({
      username: e.username,
      userId: userMap[e.username] ?? null,
      kind: e.kind,
      message: e.message ?? '',
      world: e.world ?? '',
      x: e.x ?? null,
      y: e.y ?? null,
      z: e.z ?? null,
      extra: e.extra ?? '',
    })),
    skipDuplicates: false,
  })

  return NextResponse.json({ ok: true, count: body.events.length })
}
