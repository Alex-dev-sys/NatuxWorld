// src/lib/fulfillment.ts
// Единая точка выдачи заказа: RCON-команды + финальный статус.
import { products } from './products'
import { buildCommands, executeRcon, DURATION_DAYS } from './rcon'
import { updateOrder } from './store'
import type { Order } from './types'

export async function fulfillOrder(order: Order): Promise<Order | null> {
  const product = products.find(p => p.id === order.productId)
  const variant = product?.variants.find(v => v.duration === order.variantDuration)

  // Без варианта нечего выдавать — нельзя помечать заказ выполненным.
  if (!variant) {
    return updateOrder(order.publicId, {
      status: 'delivery_failed',
      deliveryError: `Вариант товара не найден: ${order.productId}/${order.variantDuration}`,
      rconCommands: [],
    })
  }

  const commands = buildCommands(variant.commands, {
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
