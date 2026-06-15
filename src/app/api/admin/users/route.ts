import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, username: true, email: true,
      emailVerified: true, tokenVersion: true, createdAt: true,
    },
  })

  const ids = users.map(u => u.id)

  const [orderCounts, lastLogins] = await Promise.all([
    prisma.order.groupBy({ by: ['username'], _count: { id: true } }),
    prisma.loginEvent.findMany({
      where: { userId: { in: ids }, kind: 'login' },
      orderBy: { createdAt: 'desc' },
      distinct: ['userId'],
      select: { userId: true, createdAt: true, ip: true },
    }),
  ])

  const orderMap = Object.fromEntries(orderCounts.map(o => [o.username, o._count.id]))
  const loginMap = Object.fromEntries(lastLogins.map(l => [l.userId, { at: l.createdAt, ip: l.ip }]))

  return NextResponse.json(users.map(u => ({
    ...u,
    orders: orderMap[u.username] ?? 0,
    lastLogin: loginMap[u.id] ?? null,
  })))
}
