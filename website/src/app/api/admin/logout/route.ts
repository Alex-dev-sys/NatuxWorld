import { NextRequest, NextResponse } from 'next/server'
import { revokeAdminSession } from '@/lib/adminAuth'

export async function POST(req: NextRequest) {
  // Server-side revocation, not just cookie clearing. Persisted, so the cookie
  // stays dead after a restart too.
  const token = req.cookies.get('admin_session')?.value
  if (token) {
    try {
      await revokeAdminSession(token)
    } catch (err) {
      // Clearing the browser cookie alone is not a logout: a saved copy would
      // still authenticate once the database is reachable again. Say so instead
      // of reporting success, and leave the cookie in place so the operator can
      // retry rather than believing they are signed out.
      console.error('[admin] session revocation failed:', err)
      return NextResponse.json(
        { error: 'Не удалось завершить сессию на сервере. Повторите выход.' },
        { status: 503 },
      )
    }
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_session', '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
  })
  return res
}
