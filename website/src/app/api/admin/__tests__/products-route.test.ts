import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const db = vi.hoisted(() => ({
  product: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  productVariant: { deleteMany: vi.fn(), createMany: vi.fn() },
  adminAudit: { create: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ prisma: db }))

import { GET, POST } from '@/app/api/admin/products/route'

function req(body?: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
    json: async () => body ?? {},
  } as unknown as import('next/server').NextRequest
}

beforeEach(() => { Object.values(db.product).forEach(f => f.mockReset()); db.productVariant.deleteMany.mockReset(); db.productVariant.createMany.mockReset(); db.adminAudit.create.mockReset() })

describe('admin products route', () => {
  it('GET lists the full catalog (incl inactive)', async () => {
    db.product.findMany.mockResolvedValue([])
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  it('POST action=seed seeds and audits', async () => {
    db.product.upsert.mockResolvedValue({})
    db.productVariant.deleteMany.mockResolvedValue({})
    db.productVariant.createMany.mockResolvedValue({})
    const res = await POST(req({ action: 'seed' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.count).toBeGreaterThan(0)
    expect(db.adminAudit.create).toHaveBeenCalledOnce()
  })

  it('POST create rejects missing id/slug/name', async () => {
    const res = await POST(req({ name: 'X' }))
    expect(res.status).toBe(400)
  })

  it('POST create rejects a duplicate id with 409', async () => {
    db.product.findUnique.mockResolvedValue({ id: 'baron' })
    const res = await POST(req({ id: 'baron', slug: 'baron', name: 'Baron' }))
    expect(res.status).toBe(409)
  })

  it('POST create makes a product and audits', async () => {
    db.product.findUnique.mockResolvedValue(null)
    db.product.create.mockResolvedValue({ id: 'duke' })
    const res = await POST(req({ id: 'duke', slug: 'duke', name: 'Duke', variants: [{ duration: '30d', durationLabel: '30', price: 100, commands: ['c'] }] }))
    expect(res.status).toBe(201)
    expect(db.adminAudit.create).toHaveBeenCalledOnce()
  })
})
