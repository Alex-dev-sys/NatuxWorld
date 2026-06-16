import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'

export const dynamic = 'force-dynamic'

// Parses vanilla `list` output:
// "There are 2 of 20 players online: steve, alex"
function parseList(text: string): { online: number; max: number; players: string[] } {
  const m = text.match(/There are (\d+) of (?:a max of )?(\d+) players online:?\s*(.*)/i)
  if (!m) return { online: 0, max: 0, players: [] }
  const players = (m[3] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return { online: Number(m[1]), max: Number(m[2]), players }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const result = await executeRcon(['list'])
  if (!result.success) return NextResponse.json({ error: result.error ?? 'RCON недоступен' }, { status: 502 })
  return NextResponse.json(parseList(result.responses?.[0] ?? ''))
}
