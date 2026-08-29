import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getOrder, claimOrderForDelivery, fulfillOrder } = vi.hoisted(() => ({
  getOrder: vi.fn(),
  claimOrderForDelivery: vi.fn(),
  fulfillOrder: vi.fn(),
}))

vi.mock('@/lib/store', () => ({ getOrder, claimOrderForDelivery }))
vi.mock('@/lib/fulfillment', () => ({ fulfillOrder }))
vi.mock('@/lib/paymentConfig', () => ({ isMockPaymentsEnabled: () => true }))

import { POST } from '@/app/api/payments/webhook/mock/route'

function req(body: unknown) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  getOrder.mockReset()
  claimOrderForDelivery.mockReset()
  fulfillOrder.mockReset()
})

describe('mock payment webhook', () => {
  it('does not accept an internal order id', async () => {
    const res = await POST(req({ orderId: 'internal-id' }))
    expect(res.status).toBe(404)
    expect(getOrder).not.toHaveBeenCalled()
  })

  it('looks up orders only by public id', async () => {
    const order = { publicId: 'public-id', status: 'waiting_payment' }
    getOrder.mockResolvedValue(order)
    claimOrderForDelivery.mockResolvedValue(order)
    fulfillOrder.mockResolvedValue({ ...order, status: 'delivered' })
    const res = await POST(req({ publicId: order.publicId }))
    expect(res.status).toBe(200)
    expect(getOrder).toHaveBeenCalledWith(order.publicId)
    expect(claimOrderForDelivery).toHaveBeenCalledWith(order.publicId, expect.stringMatching(/^mock_/))
  })
})
