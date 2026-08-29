import { prisma } from '@/lib/db'
import { products as staticProducts } from '@/lib/products'
import type { Product, Duration } from '@/lib/types'

// DB-backed product catalog. The static products.ts array is kept as the seed
// source (see seedProducts) and as a graceful fallback when the DB has not been
// seeded yet — so the shop never goes blank right after the migration runs.

type VariantRow = { duration: string; durationLabel: string; price: number; commands: string[] }
type ProductRow = {
  id: string; slug: string; name: string; description: string; color: string
  order: number; active: boolean; badge: string | null; popular: boolean
  perks: string[]; variants: VariantRow[]
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    color: row.color,
    order: row.order,
    active: row.active,
    badge: row.badge ?? undefined,
    popular: row.popular,
    perks: row.perks,
    variants: row.variants.map(v => ({
      duration: v.duration as Duration,
      durationLabel: v.durationLabel,
      price: v.price,
      commands: v.commands,
    })),
  }
}

export async function getProducts(): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    include: { variants: { orderBy: { order: 'asc' } } },
    orderBy: { order: 'asc' },
  })
  if (rows.length === 0) return staticProducts
  return rows.map(rowToProduct)
}

export async function getActiveProducts(): Promise<Product[]> {
  return (await getProducts()).filter(p => p.active).sort((a, b) => a.order - b.order)
}

export async function getProductById(id: string): Promise<Product | null> {
  return (await getProducts()).find(p => p.id === id) ?? null
}

// Idempotent: upserts scalar fields and fully replaces each product's variants
// from the static catalog. Safe to run repeatedly.
export async function seedProducts(): Promise<number> {
  for (const p of staticProducts) {
    const scalars = {
      slug: p.slug, name: p.name, description: p.description, color: p.color,
      order: p.order, active: p.active, badge: p.badge ?? null, popular: p.popular ?? false,
      perks: p.perks,
    }
    await prisma.product.upsert({ where: { id: p.id }, create: { id: p.id, ...scalars }, update: scalars })
    await prisma.productVariant.deleteMany({ where: { productId: p.id } })
    await prisma.productVariant.createMany({
      data: p.variants.map((v, i) => ({
        productId: p.id, duration: v.duration, durationLabel: v.durationLabel,
        price: v.price, commands: v.commands, order: i,
      })),
    })
  }
  return staticProducts.length
}
