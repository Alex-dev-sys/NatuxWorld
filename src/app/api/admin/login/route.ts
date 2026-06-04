import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { makeSessionToken } from '@/lib/adminAuth'

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

  const a = Buffer.from(body.password)
  const b = Buffer.from(adminPassword)
  const match = a.length === b.length && timingSafeEqual(a, b)
  if (!match) {
    await new Promise(r => setTimeout(r, 500))
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 })
  }

  // Session token = HMAC(ADMIN_SECRET, constant) — не раскрывает сам секрет
  const sessionToken = makeSessionToken(adminSecret)

  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return res
}
