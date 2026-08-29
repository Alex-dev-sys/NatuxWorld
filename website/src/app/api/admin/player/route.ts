import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'
import { buildPlayerCommand, PLAYER_ACTIONS } from '@/lib/playerActions'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json() as { action: string; confirm?: boolean } & Record<string, unknown>
  const { action, confirm, ...params } = body

  const def = PLAYER_ACTIONS[action]
  if (!def) return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })

  let command: string
  try {
    command = buildPlayerCommand(action, params)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  if (def.tier !== 'safe' && !confirm) {
    return NextResponse.json({ needConfirm: true, action })
  }

  const result = await executeRcon([command])
  await logAdminAction(req, `player.${action}`, {
    target: typeof params.username === 'string' ? params.username : undefined,
    params: { command },
    ok: result.success,
  })
  return NextResponse.json({ ok: result.success, response: result.responses?.[0], error: result.error })
}
