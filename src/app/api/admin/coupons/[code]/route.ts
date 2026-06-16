import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

type Ctx = { params: { code: string } }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const coupon = await prisma.coupon.update({
    where: { code: params.code.toUpperCase() },
    data: body,
  })
  await logAdminAction(req, 'coupon.update', { target: params.code.toUpperCase(), params: body, ok: true })
  return NextResponse.json(coupon)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  await prisma.coupon.delete({ where: { code: params.code.toUpperCase() } })
  await logAdminAction(req, 'coupon.delete', { target: params.code.toUpperCase(), ok: true })
  return NextResponse.json({ ok: true })
}
