import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'
import { classifyRcon } from '@/lib/rconPolicy'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { command, confirm } = await req.json() as { command: string; confirm?: boolean }
  const trimmed = command?.trim()
  if (!trimmed) return NextResponse.json({ error: 'Команда пустая' }, { status: 400 })

  const tier = classifyRcon(trimmed)
  if (tier !== 'safe' && !confirm) {
    return NextResponse.json({ needConfirm: true, tier, command: trimmed })
  }

  const result = await executeRcon([trimmed])
  await logAdminAction(req, 'rcon.exec', { params: { command: trimmed, tier }, ok: result.success })
  return NextResponse.json(result)
}
