import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProductById = vi.hoisted(() => vi.fn())
const updateOrder = vi.hoisted(() => vi.fn())
vi.mock('@/lib/productStore', () => ({ getProductById }))
vi.mock('@/lib/store', () => ({ updateOrder }))

import { fulfillOrder } from '@/lib/fulfillment'
import type { Order } from '@/lib/types'

describe('fulfillOrder snapshot integrity', () => {
  beforeEach(() => {
    getProductById.mockReset()
    updateOrder.mockReset()
    process.env.RCON_MOCK = 'true'
  })

  it('executes the immutable checkout snapshot without reading the mutable catalog', async () => {
    const order: Order = {
      id: 'order-1', publicId: 'public-1', productId: 'baron', productName: 'Baron',
      variantDuration: '30d', variantDurationLabel: '30 дней', price: 99,
      username: 'steve', status: 'delivery_pending', createdAt: new Date().toISOString(),
      fulfillmentCommands: ['lp user {username} parent addtemp {rank} {duration_days}d'],
    }
    updateOrder.mockImplementation(async (_id, updates) => ({ ...order, ...updates }))

    await fulfillOrder(order)

    expect(getProductById).not.toHaveBeenCalled()
    expect(updateOrder).toHaveBeenCalledWith('public-1', expect.objectContaining({
      status: 'delivered',
      rconCommands: ['lp user steve parent addtemp baron 30d'],
    }))
  })
})
