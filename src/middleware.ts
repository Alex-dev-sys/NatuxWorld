import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

async function verifySession(token: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('admin-session-v1'))
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  // Constant-time string comparison via XOR
  if (token.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

function unauthorized(req: NextRequest, isApi: boolean) {
  if (isApi) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const loginUrl = new URL('/admin/login', req.url)
  loginUrl.searchParams.set('from', req.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAdminPage = pathname.startsWith('/admin') && pathname !== '/admin/login'
  const isAdminApi = pathname.startsWith('/api/admin') &&
    pathname !== '/api/admin/login' &&
    pathname !== '/api/admin/logout'

  if (!isAdminPage && !isAdminApi) return NextResponse.next()

  const secret = process.env.ADMIN_SECRET
  const token = req.cookies.get('admin_session')?.value

  if (!secret || !token || !(await verifySession(token, secret))) {
    return unauthorized(req, isAdminApi)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
