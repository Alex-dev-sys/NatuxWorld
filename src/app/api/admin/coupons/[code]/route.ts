import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

type Ctx = { params: { code: string } }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const coupon = await prisma.coupon.update({
    where: { code: params.code.toUpperCase() },
    data: body,
  })
  return NextResponse.json(coupon)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  await prisma.coupon.delete({ where: { code: params.code.toUpperCase() } })
  return NextResponse.json({ ok: true })
}
