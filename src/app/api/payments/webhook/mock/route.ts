import { NextRequest, NextResponse } from 'next/server'
import { getOrder, updateOrder, getAllOrders } from '@/lib/store'
import { products } from '@/lib/products'
import { buildCommands, executeRcon } from '@/lib/rcon'
import type { Duration } from '@/lib/types'

const DURATION_DAYS: Record<Duration, string> = {
  '30d': '30',
  '90d': '90',
  'forever': '∞',
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Find order by id or publicId
  const { orderId, publicId } = body as { orderId?: string; publicId?: string }

  let order = null
  if (publicId) {
    order = getOrder(publicId)
  } else if (orderId) {
    order = getAllOrders().find(o => o.id === orderId) ?? null
  }

  if (!order) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }

  // Idempotency — don't process twice
  if (['paid', 'delivery_pending', 'delivered', 'delivery_failed'].includes(order.status)) {
    return NextResponse.json({ message: 'Уже обработан', order })
  }

  // Mark as paid
  let updated = updateOrder(order.publicId, {
    status: 'delivery_pending',
    paidAt: new Date().toISOString(),
    paymentId: `mock_${Date.now()}`,
  })

  if (!updated) {
    return NextResponse.json({ error: 'Ошибка обновления заказа' }, { status: 500 })
  }

  // Build RCON commands
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

  // Execute RCON (mock)
  const result = await executeRcon(commands)

  if (result.success) {
    updated = updateOrder(order.publicId, {
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      rconCommands: result.commands,
    })
  } else {
    updated = updateOrder(order.publicId, {
      status: 'delivery_failed',
      deliveryError: result.error,
      rconCommands: result.commands,
    })
  }

  return NextResponse.json({ message: 'Обработан', order: updated })
}
