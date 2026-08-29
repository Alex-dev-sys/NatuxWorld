import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { product: { findMany: (...a: unknown[]) => findMany(...a) } } }))

import { getProducts, getActiveProducts, getProductById } from '@/lib/productStore'
import { products as staticProducts } from '@/lib/products'

beforeEach(() => { findMany.mockReset() })

describe('productStore', () => {
  it('falls back to the static catalog when the DB is empty', async () => {
    findMany.mockResolvedValue([])
    const p = await getProducts()
    expect(p.length).toBe(staticProducts.length)
    expect(p).toEqual(staticProducts)
  })

  it('maps DB rows to the Product shape', async () => {
    findMany.mockResolvedValue([{
      id: 'baron', slug: 'baron', name: 'Baron', description: 'd', color: '#fff',
      order: 1, active: true, badge: null, popular: false, perks: ['x'],
      variants: [{ duration: '30d', durationLabel: '30', price: 99, commands: ['c'] }],
    }])
    const [p] = await getProducts()
    expect(p.badge).toBeUndefined()
    expect(p.variants[0]).toEqual({ duration: '30d', durationLabel: '30', price: 99, commands: ['c'] })
  })

  it('getActiveProducts filters inactive and sorts by order', async () => {
    findMany.mockResolvedValue([
      { id: 'b', slug: 'b', name: 'B', description: '', color: '', order: 2, active: true, badge: null, popular: false, perks: [], variants: [] },
      { id: 'a', slug: 'a', name: 'A', description: '', color: '', order: 1, active: false, badge: null, popular: false, perks: [], variants: [] },
    ])
    const active = await getActiveProducts()
    expect(active.map(p => p.id)).toEqual(['b'])
  })

  it('getProductById returns null for a missing id', async () => {
    findMany.mockResolvedValue([])
    expect(await getProductById('nope-xyz')).toBeNull()
  })
})
