import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { apiError, authenticatedUser } from '@/lib/auth'
import { generateAppPassword, hashAppPassword } from '@/lib/appPassword'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await authenticatedUser(req.headers)
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)
  const userId = user.id
  const list = await prisma.appPassword.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
  })
  return Response.json({ appPasswords: list })
}

export async function POST(req: NextRequest) {
  const user = await authenticatedUser(req.headers)
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)
  const userId = user.id
  if (!user.twoFactorEnabled) return apiError('bad_request', 'App-пароли доступны только с включённой 2FA', 400)

  const { label, password } = (await req.json().catch(() => ({}))) as {
    label?: string
    password?: string
  }
  // Step-up: minting a game credential requires the account password, so a
  // stolen bearer JWT alone cannot create long-lived Minecraft logins.
  if (!password || password.length > 200 || !(await bcrypt.compare(password, user.passwordHash))) {
    return apiError('bad_credentials', 'Неверный пароль', 401)
  }
  const existing = await prisma.appPassword.count({ where: { userId } })
  if (existing >= 10) return apiError('bad_request', 'Достигнут лимит игровых паролей (10)', 400)

  const clean = (label ?? '').trim().slice(0, 40) || 'Игровой пароль'
  const plain = generateAppPassword()
  await prisma.appPassword.create({ data: { userId, label: clean, hash: await hashAppPassword(plain) } })
  return Response.json({ ok: true, label: clean, password: plain })
}
