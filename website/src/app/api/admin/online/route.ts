import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'
import { parsePlayers } from '@/lib/rconParsers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const result = await executeRcon(['list'])
  if (!result.success) return NextResponse.json({ error: result.error ?? 'RCON недоступен' }, { status: 502 })
  return NextResponse.json(parsePlayers(result.responses?.[0] ?? ''))
}
