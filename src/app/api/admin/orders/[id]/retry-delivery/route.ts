// src/app/api/admin/orders/[id]/retry-delivery/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrderById, updateOrder } from '@/lib/store'
import { products } from '@/lib/products'
import { buildCommands, executeRcon, DURATION_DAYS } from '@/lib/rcon'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const order = await getOrderById(params.id)
  if (!order) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }

  if (!['paid', 'delivery_failed', 'delivery_pending'].includes(order.status)) {
    return NextResponse.json({ error: 'Нельзя повторить выдачу для этого статуса' }, { status: 400 })
  }

  await updateOrder(order.publicId, { status: 'delivery_pending', deliveryError: undefined })

  const product = products.find(p => p.id === order.productId)
  const variant = product?.variants.find(v => v.duration === order.variantDuration)

  const commands = variant
    ? buildCommands(variant.commands, {
        username: order.username,
        rank: order.productId,
        duration: order.variantDurationLabel,
        durationDays: DURATION_DAYS[order.variantDuration] ?? '?',
        orderId: order.id,
        price: order.price,
      })
    : []

  const result = await executeRcon(commands)

  const updated = await updateOrder(
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

  return NextResponse.json({ order: updated })
}
