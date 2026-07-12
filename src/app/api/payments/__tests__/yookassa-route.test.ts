import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getOrderById: vi.fn(),
  getOrderByPaymentId: vi.fn(),
  claimOrderForDelivery: vi.fn(),
}))
const verifyPayment = vi.hoisted(() => vi.fn())
const fulfillOrder = vi.hoisted(() => vi.fn())

vi.mock('@/lib/store', () => store)
vi.mock('@/lib/yookassa', () => ({ verifyPayment }))
vi.mock('@/lib/fulfillment', () => ({ fulfillOrder }))

import { POST } from '@/app/api/payments/yookassa/route'

function request(body: unknown) {
  return { text: async () => JSON.stringify(body) } as unknown as import('next/server').NextRequest
}

const notification = (metadataPublicId = 'attacker-controlled') => ({
  event: 'payment.succeeded',
  object: { id: 'pay_1', metadata: { publicId: metadataPublicId } },
})

const order = {
  id: 'order-id', publicId: 'trusted-order', price: 499, status: 'waiting_payment',
}

describe('YooKassa webhook verification', () => {
  beforeEach(() => {
    Object.values(store).forEach((fn) => fn.mockReset())
    verifyPayment.mockReset()
    fulfillOrder.mockReset()
    store.getOrderByPaymentId.mockResolvedValue(undefined)
    store.getOrder.mockResolvedValue(order)
    store.getOrderById.mockResolvedValue(undefined)
    store.claimOrderForDelivery.mockResolvedValue(order)
    fulfillOrder.mockResolvedValue({ ...order, status: 'delivered' })
  })

  it('uses authenticated API metadata, never webhook metadata', async () => {
    verifyPayment.mockResolvedValue({
      id: 'pay_1', status: 'succeeded', paid: true,
      metadata: { publicId: 'trusted-order' },
      amount: { value: '499.00', currency: 'RUB' },
    })

    const res = await POST(request(notification('expensive-order')))

    expect(res.status).toBe(200)
    expect(store.getOrder).toHaveBeenCalledWith('trusted-order')
    expect(store.getOrder).not.toHaveBeenCalledWith('expensive-order')
    expect(store.claimOrderForDelivery).toHaveBeenCalledWith('trusted-order', 'yookassa_pay_1')
  })

  it('rejects a successful payment whose amount does not match the order', async () => {
    verifyPayment.mockResolvedValue({
      id: 'pay_1', status: 'succeeded', paid: true,
      metadata: { publicId: 'trusted-order' },
      amount: { value: '1.00', currency: 'RUB' },
    })

    const res = await POST(request(notification()))

    expect(res.status).toBe(403)
    expect(store.claimOrderForDelivery).not.toHaveBeenCalled()
  })

  it('rejects a payment in a different currency', async () => {
    verifyPayment.mockResolvedValue({
      id: 'pay_1', status: 'succeeded', paid: true,
      metadata: { publicId: 'trusted-order' },
      amount: { value: '499.00', currency: 'USD' },
    })

    expect((await POST(request(notification()))).status).toBe(403)
  })
})
