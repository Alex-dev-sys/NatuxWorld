import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [
    totalUsers, verifiedUsers,
    totalOrders, ordersToday, revenue,
    activeSessions,
    loginsToday, failsToday,
    crashesToday, totalCrashes,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: today } } }),
    prisma.order.aggregate({ _sum: { price: true }, where: { status: { in: ['delivered', 'paid', 'delivery_pending'] } } }),
    prisma.gameToken.count({ where: { serverId: { not: null } } }),
    prisma.loginEvent.count({ where: { kind: 'login', createdAt: { gte: today } } }),
    prisma.loginEvent.count({ where: { kind: 'fail', createdAt: { gte: today } } }),
    prisma.crashReport.count({ where: { createdAt: { gte: today } } }),
    prisma.crashReport.count(),
  ])

  return NextResponse.json({
    users: { total: totalUsers, verified: verifiedUsers },
    orders: { total: totalOrders, today: ordersToday, revenue: revenue._sum.price ?? 0 },
    sessions: { active: activeSessions },
    logins: { today: loginsToday, failsToday },
    crashes: { today: crashesToday, total: totalCrashes },
  })
}
