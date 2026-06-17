import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { mcBridge } from '@/lib/mc-bridge'
import type { McBridgeCommand } from '@/lib/mc-bridge'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

const ALLOWED_ACTIONS = new Set(['status', 'start', 'stop', 'restart'])
// Lifecycle actions that change server state — these get written to the audit log.
const AUDITED_ACTIONS = new Set(['start', 'stop', 'restart'])

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { action, lines } = await req.json() as { action: string; lines?: number }
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  let command: McBridgeCommand
  if (action === 'console') {
    const n = Math.min(Math.max(Number(lines) || 100, 1), 500)
    command = `console ${n}` as McBridgeCommand
  } else if (ALLOWED_ACTIONS.has(action)) {
    command = action as McBridgeCommand
  } else {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  try {
    const output = await mcBridge(command)
    if (AUDITED_ACTIONS.has(action)) await logAdminAction(req, `server.${action}`, { ok: true })
    return NextResponse.json({ ok: true, output })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (AUDITED_ACTIONS.has(action)) await logAdminAction(req, `server.${action}`, { ok: false, params: { error: message } })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
