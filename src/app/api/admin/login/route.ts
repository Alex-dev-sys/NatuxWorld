import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.password) {
    return NextResponse.json({ error: 'Пароль не указан' }, { status: 400 })
  }

  const adminPassword = process.env.ADMIN_PASSWORD
  const adminSecret = process.env.ADMIN_SECRET

  if (!adminPassword || !adminSecret) {
    return NextResponse.json({ error: 'Сервер не настроен' }, { status: 500 })
  }

  if (body.password !== adminPassword) {
    // Constant-time comparison to prevent timing attacks
    await new Promise(r => setTimeout(r, 500))
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_session', adminSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
  return res
}
