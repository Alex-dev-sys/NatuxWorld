import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const events = await prisma.loginEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  type EventRow = typeof events[number]
  type UserRow = { id: string; username: string }
  const userIds = [...new Set(events.map((e: EventRow) => e.userId).filter(Boolean) as string[])]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  })
  const userMap = Object.fromEntries((users as UserRow[]).map((u: UserRow) => [u.id, u.username]))

  return NextResponse.json(events.map((e: EventRow) => ({
    ...e,
    username: e.userId ? (userMap[e.userId] ?? null) : null,
  })))
}
