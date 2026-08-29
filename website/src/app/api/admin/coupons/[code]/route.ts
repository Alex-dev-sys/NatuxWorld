import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/adminAuth'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

type Ctx = { params: { code: string } }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const data: Record<string, unknown> = {}
  if ('active' in input) {
    if (typeof input.active !== 'boolean') return NextResponse.json({ error: 'active must be boolean' }, { status: 400 })
    data.active = input.active
  }
  if ('description' in input) {
    if (typeof input.description !== 'string' || input.description.length > 500) {
      return NextResponse.json({ error: 'Invalid description' }, { status: 400 })
    }
    data.description = input.description
  }
  if ('maxUses' in input) {
    if (input.maxUses !== null && (typeof input.maxUses !== 'number' || !Number.isInteger(input.maxUses) || input.maxUses < 1)) {
      return NextResponse.json({ error: 'Invalid maxUses' }, { status: 400 })
    }
    data.maxUses = input.maxUses
  }
  if ('expiresAt' in input) {
    if (input.expiresAt !== null && (typeof input.expiresAt !== 'string' || Number.isNaN(Date.parse(input.expiresAt)))) {
      return NextResponse.json({ error: 'Invalid expiresAt' }, { status: 400 })
    }
    data.expiresAt = input.expiresAt === null ? null : new Date(input.expiresAt as string)
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No editable fields' }, { status: 400 })

  const coupon = await prisma.coupon.update({
    where: { code: params.code.toUpperCase() },
    data,
  })
  await logAdminAction(req, 'coupon.update', { target: params.code.toUpperCase(), params: data, ok: true })
  return NextResponse.json(coupon)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  await prisma.coupon.delete({ where: { code: params.code.toUpperCase() } })
  await logAdminAction(req, 'coupon.delete', { target: params.code.toUpperCase(), ok: true })
  return NextResponse.json({ ok: true })
}
