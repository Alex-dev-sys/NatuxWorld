import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => true }))
const store = vi.hoisted(() => ({ getOrderById: vi.fn(), updateOrder: vi.fn() }))
vi.mock('@/lib/store', () => store)
const auditCreate = vi.fn()
vi.mock('@/lib/db', () => ({ prisma: { adminAudit: { create: (...a: unknown[]) => auditCreate(...a) } } }))

import { POST } from '@/app/api/admin/orders/[id]/refund/route'

function req() {
  return { headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }) } as unknown as import('next/server').NextRequest
}
const ctx = (id: string) => ({ params: { id } })
const order = (status: string) => ({
  id: 'o1', publicId: 'pub1', username: 'steve', productId: 'baron',
  variantDuration: '30d', variantDurationLabel: '30 дней', price: 99, status,
})

beforeEach(() => { store.getOrderById.mockReset(); store.updateOrder.mockReset(); auditCreate.mockReset(); process.env.RCON_MOCK = 'true'; delete process.env.RCON_MOCK_FAIL })

describe('admin order refund route', () => {
  it('404 when the order is missing', async () => {
    store.getOrderById.mockResolvedValue(undefined)
    const res = await POST(req(), ctx('nope'))
    expect(res.status).toBe(404)
  })

  it('400 for a non-refundable status', async () => {
    store.getOrderById.mockResolvedValue(order('waiting_payment'))
    const res = await POST(req(), ctx('o1'))
    expect(res.status).toBe(400)
    expect(store.updateOrder).not.toHaveBeenCalled()
  })

  it('refunds a delivered order: revokes rank, marks refunded, audits', async () => {
    store.getOrderById.mockResolvedValue(order('delivered'))
    store.updateOrder.mockResolvedValue({ ...order('refunded') })
    const res = await POST(req(), ctx('o1'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.rconOk).toBe(true)
    expect(store.updateOrder.mock.calls[0][1].status).toBe('refunded')
    expect(auditCreate).toHaveBeenCalledOnce()
    expect(auditCreate.mock.calls[0][0].data.action).toBe('order.refund')
  })

  it('marks refund_failed when RCON revoke fails', async () => {
    process.env.RCON_MOCK_FAIL = 'true'
    store.getOrderById.mockResolvedValue(order('delivered'))
    store.updateOrder.mockResolvedValue({ ...order('refund_failed') })
    const res = await POST(req(), ctx('o1'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.rconOk).toBe(false)
    expect(store.updateOrder.mock.calls[0][1].status).toBe('refund_failed')
    expect(auditCreate.mock.calls[0][0].data.ok).toBe(false)
  })
})
