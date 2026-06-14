import { NextRequest } from 'next/server'
import { verifySessionToken } from '@/lib/adminSession'

export async function requireAdmin(req: NextRequest): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET
  const token = req.cookies.get('admin_session')?.value
  if (!secret || !token) return false
  return verifySessionToken(token, secret)
}
