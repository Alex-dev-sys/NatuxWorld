import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export interface LeaderboardEntry {
  nick: string
  rank: string
  spent: number
}

export async function GET() {
  try {
    const spending = await prisma.order.groupBy({
      by: ['username'],
      where: { status: 'delivered' },
      _sum: { price: true },
      orderBy: { _sum: { price: 'desc' } },
      take: 7,
    })

    const donors: LeaderboardEntry[] = await Promise.all(
      spending.map(async (s: typeof spending[number]) => {
        const lastOrder = await prisma.order.findFirst({
          where: { username: s.username, status: 'delivered' },
          orderBy: { paidAt: 'desc' },
          select: { productName: true },
        })
        return {
          nick: s.username,
          rank: lastOrder?.productName ?? 'Unknown',
          spent: s._sum.price ?? 0,
        }
      })
    )

    return NextResponse.json(donors)
  } catch {
    return NextResponse.json([])
  }
}
