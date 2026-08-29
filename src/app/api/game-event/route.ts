import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/clientIp'

export const dynamic = 'force-dynamic'

// Constant-time compare over fixed-length digests so neither value's length nor
// content leaks via timing.
function keysMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

// Plugin sends events here with GAME_API_KEY header
export async function POST(req: NextRequest) {
  const expected = process.env.GAME_API_KEY
  const key = req.headers.get('x-api-key')
  if (!expected || !key || !keysMatch(key, expected)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Key-gated, but cap throughput so a leaked key can't flood the events table.
  if (!rateLimit(`game-event:${clientIp(req)}`, 120, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 256 * 1024) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
  }

  let body: { events?: Array<Record<string, unknown>> }
  try {
    const rawBody = await req.text()
    if (rawBody.length > 256 * 1024) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    body = JSON.parse(rawBody) as { events?: Array<Record<string, unknown>> }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ error: 'No events' }, { status: 400 })
  }

  const events = body.events.slice(0, 500).map(e => ({
    username: str(e.username, 16),
    kind: str(e.kind, 50),
    message: str(e.message, 500),
    world: str(e.world, 50),
    x: typeof e.x === 'number' ? e.x : null,
    y: typeof e.y === 'number' ? e.y : null,
    z: typeof e.z === 'number' ? e.z : null,
    extra: str(e.extra, 500),
  }))

  // Batch-resolve usernames to userIds
  type EventRow = typeof events[number]
  const usernames = [...new Set(events.map((e: EventRow) => e.username))]
  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true },
  })
  type UserRow = typeof users[number]
  const userMap = Object.fromEntries(users.map((u: UserRow) => [u.username, u.id]))

  await prisma.gameEvent.createMany({
    data: events.map((e: EventRow) => ({ ...e, userId: userMap[e.username] ?? null })),
    skipDuplicates: false,
  })

  return NextResponse.json({ ok: true, count: events.length })
}
