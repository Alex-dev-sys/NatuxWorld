import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/clientIp'

// Count-only launcher telemetry sink. The client is strictly allowlisted to
// {event, version, platform, arch} — no identifiers, no logs, no free text.
// Every accepted POST increments one aggregate counter row (per day).

export const dynamic = 'force-dynamic'

const ALLOWED_EVENTS = new Set(['install_ok', 'install_fail', 'launch_ok', 'game_crash'])
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const TOKEN_RE = /^[A-Za-z0-9_-]{1,20}$/

function str(v: unknown, re: RegExp, max: number): string | null {
  if (typeof v !== 'string' || v.length > max) return null
  return re.test(v) ? v : null
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`launcher-events:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const event = str(body.event, /^[a-z_]+$/, 20)
  const version = str(body.version, VERSION_RE, 20)
  const platform = str(body.platform, TOKEN_RE, 20)
  const arch = str(body.arch, TOKEN_RE, 20)
  if (!event || !ALLOWED_EVENTS.has(event) || !version || !platform || !arch) {
    // 204 so a buggy/old client doesn't retry in a loop.
    return new NextResponse(null, { status: 204 })
  }

  try {
    await prisma.launcherEventStat.upsert({
      where: {
        event_version_platform_arch_day: {
          event,
          version,
          platform,
          arch,
          day: new Date(new Date().toISOString().slice(0, 10)),
        },
      },
      create: { event, version, platform, arch, day: new Date(), count: 1 },
      update: { count: { increment: 1 } },
    })
  } catch {
    // Telemetry must never surface errors to the client.
  }
  return new NextResponse(null, { status: 204 })
}
