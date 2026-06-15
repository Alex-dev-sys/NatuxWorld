import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const url = new URL(req.url)
  const withLogs = url.searchParams.get('logs') === '1'
  const id = url.searchParams.get('id')

  if (id) {
    const report = await prisma.crashReport.findUnique({ where: { id } })
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(report)
  }

  const reports = await prisma.crashReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, kind: true, stage: true, message: true,
      exitCode: true, version: true, platform: true, arch: true, createdAt: true,
      ...(withLogs ? { logs: true } : {}),
    },
  })

  return NextResponse.json(reports)
}
