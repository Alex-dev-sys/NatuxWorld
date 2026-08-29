import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const tokens = await prisma.gameToken.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  type TokenRow = typeof tokens[number]
  type UserRow = { id: string; username: string; email: string }
  const userIds = [...new Set(tokens.map((t: TokenRow) => t.userId))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, email: true },
  })
  const userMap = Object.fromEntries((users as UserRow[]).map((u: UserRow) => [u.id, u]))

  return NextResponse.json(tokens.map((t: TokenRow) => ({
    accessToken: t.accessToken.slice(0, 8) + '…',
    hasServerId: !!t.serverId,
    createdAt: t.createdAt,
    user: userMap[t.userId] ?? null,
  })))
}
