import { NextRequest } from 'next/server'

export function requireAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET
  const token = req.cookies.get('admin_session')?.value
  if (!secret || !token) return false
  // Mirrors the HMAC check in middleware — same constant used in login/route.ts
  const { createHmac } = require('crypto') as typeof import('crypto')
  const expected = createHmac('sha256', secret).update('admin-session-v1').digest('hex')
  if (token.length !== expected.length) return false
  const { timingSafeEqual } = require('crypto') as typeof import('crypto')
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}
