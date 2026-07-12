// src/lib/fulfillment.ts
// Единая точка выдачи заказа: RCON-команды + финальный статус.
import { getProductById } from './productStore'
import { buildCommands, executeRcon, DURATION_DAYS } from './rcon'
import { updateOrder } from './store'
import type { Order } from './types'

export async function fulfillOrder(order: Order): Promise<Order | null> {
  let templates = order.fulfillmentCommands ?? []

  // Backward compatibility for orders created before fulfillment snapshots existed.
  // New orders never consult the mutable catalog during delivery.
  if (templates.length === 0) {
    const product = await getProductById(order.productId)
    const variant = product?.variants.find(v => v.duration === order.variantDuration)
    templates = variant?.commands ?? []
  }

  if (templates.length === 0) {
    return updateOrder(order.publicId, {
      status: 'delivery_failed',
      deliveryError: `Вариант товара не найден: ${order.productId}/${order.variantDuration}`,
      rconCommands: [],
    })
  }

  const commands = buildCommands(templates, {
    username: order.username,
    rank: order.productId,
    duration: order.variantDurationLabel,
    durationDays: DURATION_DAYS[order.variantDuration] ?? '?',
    orderId: order.id,
    price: order.price,
  })

  const result = await executeRcon(commands)

  return updateOrder(
    order.publicId,
    result.success
      ? {
          status: 'delivered',
          deliveredAt: new Date().toISOString(),
          rconCommands: result.commands,
          deliveryError: undefined,
        }
      : {
          status: 'delivery_failed',
          deliveryError: result.error,
          rconCommands: result.commands,
        }
  )
}
