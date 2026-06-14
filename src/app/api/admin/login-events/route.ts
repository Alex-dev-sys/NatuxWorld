import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const events = await prisma.loginEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json(events)
}
