// src/app/api/payments/yookassa/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrder, getAllOrders, updateOrder, getOrderByPaymentId } from '@/lib/store'
import { products } from '@/lib/products'
import { buildCommands, executeRcon, DURATION_DAYS } from '@/lib/rcon'
import { verifyPayment } from '@/lib/yookassa'

interface YooKassaNotification {
  event?: string
  object?: {
    id?: string
    status?: string
    description?: string
    metadata?: { publicId?: string }
    amount?: { value?: string; currency?: string }
    recipient?: { account_id?: string; gateway_id?: string }
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  let notification: YooKassaNotification | null = null
  try {
    notification = JSON.parse(rawBody) as YooKassaNotification
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (notification.event !== 'payment.succeeded') {
    // Acknowledge other events so YooKassa stops retrying.
    return NextResponse.json({ message: 'Ignored' })
  }

  const payment = notification.object
  if (!payment || !payment.id) {
    return NextResponse.json({ error: 'No payment object' }, { status: 400 })
  }

  // Verify by re-fetching the payment from YooKassa API
  const verified = await verifyPayment(payment.id)
  if (!verified) {
    return NextResponse.json({ error: 'Payment not confirmed by YooKassa' }, { status: 403 })
  }

  // Idempotency by paymentId
  const paymentId = `yookassa_${payment.id}`
  const existingByPaymentId = await getOrderByPaymentId(paymentId)
  if (existingByPaymentId && existingByPaymentId.status === 'delivered') {
    return NextResponse.json({ message: 'Already processed' })
  }

  // Find order by publicId from metadata, or fall back to description parsing.
  let publicId = payment.metadata?.publicId
  if (!publicId && payment.description) {
    const match = payment.description.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (match) publicId = match[0]
  }
  if (!publicId) {
    return NextResponse.json({ error: 'No publicId' }, { status: 400 })
  }

  let order = await getOrder(publicId)
  if (!order) {
    order = (await getAllOrders()).find(o => o.id === publicId)
  }
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.status === 'delivered') {
    return NextResponse.json({ message: 'Already processed' })
  }

  let updated = await updateOrder(order.publicId, {
    status: 'delivery_pending',
    paidAt: new Date().toISOString(),
    paymentId,
  })

  if (!updated) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
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

  return NextResponse.json({ message: 'OK', order: updated })
}
