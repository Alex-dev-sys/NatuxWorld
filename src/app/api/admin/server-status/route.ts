import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'
import { parsePlayers, parseTps } from '@/lib/rconParsers'

export const dynamic = 'force-dynamic'

// RCON-only server health snapshot: player roster + TPS averages.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const result = await executeRcon(['list', 'tps'])
  if (!result.success) return NextResponse.json({ error: result.error ?? 'RCON недоступен' }, { status: 502 })

  const players = parsePlayers(result.responses?.[0] ?? '')
  const tps = parseTps(result.responses?.[1] ?? '')
  return NextResponse.json({ players, tps })
}
