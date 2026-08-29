import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const coupons = await prisma.coupon.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }] })
  return NextResponse.json(coupons)
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const { code, type, value, description, maxUses, expiresAt } = body as {
    code: string; type: string; value: number; description?: string; maxUses?: number; expiresAt?: string
  }

  if (!code || !type || value == null) return NextResponse.json({ error: 'Неверные данные' }, { status: 400 })
  if (!['percent', 'fixed', 'free'].includes(type)) return NextResponse.json({ error: 'Неверный тип' }, { status: 400 })
  if (!/^[A-Z0-9_-]{2,32}$/.test(code.toUpperCase())) return NextResponse.json({ error: 'Неверный формат кода' }, { status: 400 })

  const coupon = await prisma.coupon.create({
    data: {
      code: code.toUpperCase(), type, value: Number(value),
      description: description ?? '',
      maxUses: maxUses ? Number(maxUses) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      active: true,
    },
  })
  await logAdminAction(req, 'coupon.create', { target: coupon.code, params: { type, value }, ok: true })
  return NextResponse.json(coupon)
}
