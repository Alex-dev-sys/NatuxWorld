import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/clientIp'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  if (!rateLimit(`crash-report:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const kind = typeof b.kind === 'string' ? b.kind.slice(0, 50) : 'unknown'
  const stage = typeof b.stage === 'string' ? b.stage.slice(0, 100) : 'unknown'
  const message = typeof b.message === 'string' ? b.message.slice(0, 2000) : ''
  const exitCode = typeof b.exitCode === 'number' ? b.exitCode : null
  const version = typeof b.version === 'string' ? b.version.slice(0, 50) : ''
  const platform = typeof b.platform === 'string' ? b.platform.slice(0, 20) : ''
  const arch = typeof b.arch === 'string' ? b.arch.slice(0, 20) : ''
  const logs = Array.isArray(b.logs)
    ? (b.logs as unknown[]).slice(0, 300).map(l => String(l).slice(0, 2000))
    : []

  await prisma.crashReport.create({
    data: { kind, stage, message, exitCode, logs, version, platform, arch },
  })

  return NextResponse.json({ ok: true })
}
