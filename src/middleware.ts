import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Protect /admin pages (except /admin/login)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const session = req.cookies.get('admin_session')
    const secret = process.env.ADMIN_SECRET

    if (!secret || !session?.value || session.value !== secret) {
      const loginUrl = new URL('/admin/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Protect /api/admin routes (except login/logout)
  if (pathname.startsWith('/api/admin') &&
      pathname !== '/api/admin/login' &&
      pathname !== '/api/admin/logout') {
    const session = req.cookies.get('admin_session')
    const secret = process.env.ADMIN_SECRET

    if (!secret || !session?.value || session.value !== secret) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
