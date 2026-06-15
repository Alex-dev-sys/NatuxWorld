import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { executeRcon } from '@/lib/rcon'

export const dynamic = 'force-dynamic'

// Guardrail against fat-fingering destructive commands from the panel (not a security
// boundary — the route is already behind admin auth + IP allowlist). `execute` is blocked
// because it can wrap any of the others (e.g. `execute run stop`). Leading `/` tolerated.
const DANGEROUS = /^\/?(stop|restart|ban|ban-ip|pardon|op|deop|kick|execute|whitelist\s+remove)\b/i

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { command } = await req.json() as { command: string }
  if (!command?.trim()) return NextResponse.json({ error: 'Команда пустая' }, { status: 400 })

  const trimmed = command.trim()
  if (DANGEROUS.test(trimmed)) {
    return NextResponse.json({ error: `Команда "${trimmed.split(' ')[0]}" заблокирована из панели` }, { status: 403 })
  }

  const result = await executeRcon([trimmed])
  return NextResponse.json(result)
}
