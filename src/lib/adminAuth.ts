import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

export function makeSessionToken(secret: string): string {
  return createHmac('sha256', secret).update('admin-session-v1').digest('hex')
}

export function requireAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET
  const token = req.cookies.get('admin_session')?.value
  if (!secret || !token) return false
  const expected = makeSessionToken(secret)
  if (token.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}
