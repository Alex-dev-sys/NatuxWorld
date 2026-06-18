import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { prisma } from '@/lib/db'
import { getProducts, seedProducts } from '@/lib/productStore'
import { logAdminAction } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

// Admin sees the full catalog including inactive products.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  return NextResponse.json(await getProducts())
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const body = await req.json() as Record<string, unknown>

  // One-time (idempotent) import of the static catalog into the DB.
  if (body.action === 'seed') {
    const count = await seedProducts()
    await logAdminAction(req, 'product.seed', { params: { count }, ok: true })
    return NextResponse.json({ ok: true, count })
  }

  // Create a new product with its variants.
  const { id, slug, name, description, color, order, badge, popular, perks, variants } = body as {
    id?: string; slug?: string; name?: string; description?: string; color?: string
    order?: number; badge?: string; popular?: boolean; perks?: string[]
    variants?: { duration: string; durationLabel: string; price: number; commands: string[] }[]
  }
  if (!id || !slug || !name) return NextResponse.json({ error: 'id, slug, name обязательны' }, { status: 400 })
  if (await prisma.product.findUnique({ where: { id } })) {
    return NextResponse.json({ error: 'Продукт с таким id уже существует' }, { status: 409 })
  }

  const created = await prisma.product.create({
    data: {
      id, slug, name,
      description: description ?? '', color: color ?? '#888888',
      order: Number(order) || 0, badge: badge ?? null, popular: !!popular,
      perks: perks ?? [],
      variants: { create: (variants ?? []).map((v, i) => ({
        duration: v.duration, durationLabel: v.durationLabel,
        price: Math.max(0, Math.round(Number(v.price) || 0)), commands: v.commands ?? [], order: i,
      })) },
    },
  })
  await logAdminAction(req, 'product.create', { target: id, ok: true })
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
