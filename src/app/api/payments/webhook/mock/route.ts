// src/app/api/payments/webhook/mock/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrder, getAllOrders, updateOrder } from '@/lib/store'
import { products } from '@/lib/products'
import { buildCommands, executeRcon, DURATION_DAYS } from '@/lib/rcon'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { orderId, publicId } = body as { orderId?: string; publicId?: string }

  let order = null
  if (publicId) {
    order = await getOrder(publicId)
  } else if (orderId) {
    order = (await getAllOrders()).find(o => o.id === orderId) ?? null
  }

  if (!order) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }

  if (['paid', 'delivery_pending', 'delivered', 'delivery_failed'].includes(order.status)) {
    return NextResponse.json({ message: 'Уже обработан', order })
  }

  let updated = await updateOrder(order.publicId, {
    status: 'delivery_pending',
    paidAt: new Date().toISOString(),
    paymentId: `mock_${Date.now()}`,
  })

  if (!updated) {
    return NextResponse.json({ error: 'Ошибка обновления заказа' }, { status: 500 })
  }

  const product = products.find(p => p.id === order!.productId)
  const variant = product?.variants.find(v => v.duration === order!.variantDuration)

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

  updated = await updateOrder(
    order.publicId,
    result.success
      ? { status: 'delivered', deliveredAt: new Date().toISOString(), rconCommands: result.commands }
      : { status: 'delivery_failed', deliveryError: result.error, rconCommands: result.commands }
  )

  return NextResponse.json({ message: 'Обработан', order: updated })
}
