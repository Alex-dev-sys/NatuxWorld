import { NextRequest, NextResponse } from 'next/server'
import { revokeSessionToken } from '@/lib/adminSession'

export async function POST(req: NextRequest) {
  // Server-side revocation, not just cookie clearing.
  const token = req.cookies.get('admin_session')?.value
  if (token) revokeSessionToken(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_session', '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
  })
  return res
}
