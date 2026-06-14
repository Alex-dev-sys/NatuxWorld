import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/adminSession'

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

  if (!secret || !token || !(await verifySessionToken(token, secret))) {
    return unauthorized(req, isAdminApi)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
