import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const action = req.nextUrl.searchParams.get('action')
  const rows = await prisma.adminAudit.findMany({
    where: action ? { action: { startsWith: action } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json(rows)
}
