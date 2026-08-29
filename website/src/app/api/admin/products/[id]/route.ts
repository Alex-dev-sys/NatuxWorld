import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { prisma } from '@/lib/db'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

interface PatchBody {
  name?: string
  description?: string
  color?: string
  order?: number
  active?: boolean
  badge?: string | null
  popular?: boolean
  perks?: string[]
  // Per-variant price updates, matched by duration.
  variants?: { duration: string; price: number }[]
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const existing = await prisma.product.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Продукт не найден' }, { status: 404 })

  const body = await req.json() as PatchBody
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name
  if (typeof body.description === 'string') data.description = body.description
  if (typeof body.color === 'string') data.color = body.color
  if (typeof body.order === 'number') data.order = Math.round(body.order)
  if (typeof body.active === 'boolean') data.active = body.active
  if (body.badge === null || typeof body.badge === 'string') data.badge = body.badge || null
  if (typeof body.popular === 'boolean') data.popular = body.popular
  if (Array.isArray(body.perks)) data.perks = body.perks.filter(p => typeof p === 'string')

  await prisma.product.update({ where: { id: params.id }, data })

  // Price edits per variant (matched by duration); never touches commands.
  if (Array.isArray(body.variants)) {
    for (const v of body.variants) {
      if (typeof v.price !== 'number') continue
      await prisma.productVariant.updateMany({
        where: { productId: params.id, duration: v.duration },
        data: { price: Math.max(0, Math.round(v.price)) },
      })
    }
  }

  await logAdminAction(req, 'product.update', { target: params.id, params: { fields: Object.keys(data) }, ok: true })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const existing = await prisma.product.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Продукт не найден' }, { status: 404 })

  await prisma.product.delete({ where: { id: params.id } }) // cascades to variants
  await logAdminAction(req, 'product.delete', { target: params.id, ok: true })
  return NextResponse.json({ ok: true })
}
