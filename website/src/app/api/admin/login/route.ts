import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createSessionToken, ADMIN_SESSION_TTL_SECONDS } from '@/lib/adminSession'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/clientIp'
import { verifyTotp } from '@/lib/totp'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.password) {
    return NextResponse.json({ error: 'Пароль не указан' }, { status: 400 })
  }

  const ip = clientIp(req)
  if (!rateLimit(`admin-login:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Слишком много попыток, подождите' }, { status: 429 })
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

  // Mandatory second factor for the admin panel (TOTP).
  const totpSecret = process.env.ADMIN_TOTP_SECRET
  if (!totpSecret || !body.code || !verifyTotp(String(body.code), totpSecret)) {
    await new Promise(r => setTimeout(r, 500))
    return NextResponse.json({ error: 'Неверный код 2FA' }, { status: 401 })
  }

  // Подписанный токен с истечением срока — не раскрывает сам секрет
  const sessionToken = await createSessionToken(adminSecret, ADMIN_SESSION_TTL_SECONDS)

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
