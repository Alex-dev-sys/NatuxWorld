import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const db = vi.hoisted(() => ({
  product: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  productVariant: { updateMany: vi.fn() },
  adminAudit: { create: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ prisma: db }))

import { PATCH, DELETE } from '@/app/api/admin/products/[id]/route'

function req(body?: Record<string, unknown>) {
  return {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
    json: async () => body ?? {},
  } as unknown as import('next/server').NextRequest
}
const ctx = (id: string) => ({ params: { id } })

beforeEach(() => {
  db.product.findUnique.mockReset(); db.product.update.mockReset(); db.product.delete.mockReset()
  db.productVariant.updateMany.mockReset(); db.adminAudit.create.mockReset()
})

describe('admin product [id] route', () => {
  it('PATCH 404 for a missing product', async () => {
    db.product.findUnique.mockResolvedValue(null)
    const res = await PATCH(req({ active: false }), ctx('ghost'))
    expect(res.status).toBe(404)
  })

  it('PATCH updates scalar fields and variant prices, then audits', async () => {
    db.product.findUnique.mockResolvedValue({ id: 'baron' })
    db.product.update.mockResolvedValue({})
    db.productVariant.updateMany.mockResolvedValue({})
    const res = await PATCH(req({ active: false, badge: 'SALE', variants: [{ duration: '30d', price: 79 }] }), ctx('baron'))
    expect(res.status).toBe(200)
    expect(db.product.update).toHaveBeenCalledOnce()
    const data = db.product.update.mock.calls[0][0].data
    expect(data.active).toBe(false)
    expect(data.badge).toBe('SALE')
    expect(db.productVariant.updateMany).toHaveBeenCalledOnce()
    expect(db.productVariant.updateMany.mock.calls[0][0].data.price).toBe(79)
    expect(db.adminAudit.create).toHaveBeenCalledOnce()
  })

  it('DELETE 404 for a missing product', async () => {
    db.product.findUnique.mockResolvedValue(null)
    const res = await DELETE(req(), ctx('ghost'))
    expect(res.status).toBe(404)
  })

  it('DELETE removes the product and audits', async () => {
    db.product.findUnique.mockResolvedValue({ id: 'baron' })
    db.product.delete.mockResolvedValue({})
    const res = await DELETE(req(), ctx('baron'))
    expect(res.status).toBe(200)
    expect(db.product.delete).toHaveBeenCalledOnce()
    expect(db.adminAudit.create).toHaveBeenCalledOnce()
  })
})
