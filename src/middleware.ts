import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/adminSession'

// Comma-separated allowlist from env (supports a changing home IP / multiple admins).
// Falls back to the original single IP so a missing env var keeps current access working;
// set ADMIN_ALLOWED_IPS in prod to override.
const ADMIN_ALLOWED_IPS = (process.env.ADMIN_ALLOWED_IPS ?? '109.122.200.90')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function unauthorized(req: NextRequest, isApi: boolean) {
  if (isApi) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const loginUrl = new URL('/admin/login', req.url)
  loginUrl.searchParams.set('from', req.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
  if (!isAdmin) return NextResponse.next()

  // IP whitelist — return 404 to avoid revealing admin existence.
  // Local dev has no proxy headers (browser → localhost), so skip the IP gate
  // outside production. Prod behaviour is unchanged.
  const realIp = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (process.env.NODE_ENV === 'production' && (!realIp || !ADMIN_ALLOWED_IPS.includes(realIp))) {
    return new NextResponse(null, { status: 404 })
  }

  const isAdminPage = pathname.startsWith('/admin') && pathname !== '/admin/login'
  const isAdminApi = pathname.startsWith('/api/admin') &&
    pathname !== '/api/admin/login' &&
    pathname !== '/api/admin/logout'

  if (!isAdminPage && !isAdminApi) return NextResponse.next()

  const secret = process.env.ADMIN_SECRET
  const token = req.cookies.get('admin_session')?.value

  if (!secret || !token || !(await verifySessionToken(token, secret))) {
    return unauthorized(req, isAdminApi)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
