import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, bearerUserId } from '@/lib/auth'
import { generateAppPassword, hashAppPassword } from '@/lib/appPassword'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const list = await prisma.appPassword.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
  })
  return Response.json({ appPasswords: list })
}

export async function POST(req: NextRequest) {
  const userId = bearerUserId(req.headers)
  if (!userId) return apiError('token_invalid', 'Сессия истекла', 401)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.twoFactorEnabled) return apiError('bad_request', 'App-пароли доступны только с включённой 2FA', 400)

  const { label } = (await req.json().catch(() => ({}))) as { label?: string }
  const clean = (label ?? '').trim().slice(0, 40) || 'Игровой пароль'
  const plain = generateAppPassword()
  await prisma.appPassword.create({ data: { userId, label: clean, hash: await hashAppPassword(plain) } })
  return Response.json({ ok: true, label: clean, password: plain })
}
