import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'
import { parseWhitelist } from '@/lib/rconParsers'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

const SAFE_USERNAME = /^[a-zA-Z0-9_]{3,16}$/

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const result = await executeRcon(['whitelist list'])
  if (!result.success) return NextResponse.json({ error: result.error ?? 'RCON недоступен' }, { status: 502 })
  return NextResponse.json({ players: parseWhitelist(result.responses?.[0] ?? '') })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { action, username } = await req.json() as { action?: string; username?: string }
  if (action !== 'add' && action !== 'remove') {
    return NextResponse.json({ error: 'action must be add or remove' }, { status: 400 })
  }
  if (!username || !SAFE_USERNAME.test(username)) {
    return NextResponse.json({ error: 'Некорректный ник' }, { status: 400 })
  }

  // username is validated against SAFE_USERNAME, so it is safe to interpolate.
  const result = await executeRcon([`whitelist ${action} ${username}`])
  await logAdminAction(req, `whitelist.${action}`, { target: username, ok: result.success })
  if (!result.success) return NextResponse.json({ error: result.error ?? 'RCON недоступен' }, { status: 502 })
  return NextResponse.json({ ok: true, output: result.responses?.[0] ?? '' })
}
