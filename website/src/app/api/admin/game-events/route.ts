import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const url = new URL(req.url)
  const username = url.searchParams.get('username')
  const userId = url.searchParams.get('userId')
  const kind = url.searchParams.get('kind')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 500)

  const where = {
    ...(username ? { username } : {}),
    ...(userId ? { userId } : {}),
    ...(kind && kind !== 'all' ? { kind } : {}),
  }

  const events = await prisma.gameEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json(events)
}
