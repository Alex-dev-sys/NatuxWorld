// src/app/api/payments/yoomoney/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getOrder, getAllOrders, updateOrder, getOrderByPaymentId } from '@/lib/store'
import { products } from '@/lib/products'
import { buildCommands, executeRcon, DURATION_DAYS } from '@/lib/rcon'

function verifySha1(params: Record<string, string>, secret: string): boolean {
  const str = [
    params.notification_type,
    params.operation_id,
    params.amount,
    params.currency,
    params.datetime,
    params.sender ?? '',
    params.codepro,
    secret,
    params.label ?? '',
  ].join('&')
  const hash = createHash('sha1').update(str).digest('hex')
  return hash === params.sha1_hash
}

export async function POST(req: NextRequest) {
  const text = await req.text()
  const params = Object.fromEntries(new URLSearchParams(text))

  const secret = process.env.YOOMONEY_SECRET ?? ''

  if (secret && !verifySha1(params, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const operationId = params.operation_id
  if (!operationId) {
    return NextResponse.json({ error: 'No operation_id' }, { status: 400 })
  }

  // Idempotency by paymentId
  const existingByPaymentId = await getOrderByPaymentId(`ymoney_${operationId}`)
  if (existingByPaymentId &&
      ['delivered', 'delivery_failed', 'delivery_pending'].includes(existingByPaymentId.status)) {
    return NextResponse.json({ message: 'Already processed' })
  }

  const label = params.label
  if (!label) {
    return NextResponse.json({ error: 'No label' }, { status: 400 })
  }

  let order = await getOrder(label)
  if (!order) {
    order = (await getAllOrders()).find(o => o.id === label)
  }
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (['paid', 'delivery_pending', 'delivered', 'delivery_failed'].includes(order.status)) {
    return NextResponse.json({ message: 'Already processed' })
  }

  const paidAmount = parseFloat(params.amount ?? '0')
  if (paidAmount < order.price) {
    return NextResponse.json({ error: 'Insufficient amount' }, { status: 400 })
  }

  let updated = await updateOrder(order.publicId, {
    status: 'delivery_pending',
    paidAt: new Date().toISOString(),
    paymentId: `ymoney_${operationId}`,
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
