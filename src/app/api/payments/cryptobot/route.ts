// src/app/api/payments/cryptobot/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrder, getAllOrders, updateOrder, getOrderByPaymentId } from '@/lib/store'
import { products } from '@/lib/products'
import { buildCommands, executeRcon, DURATION_DAYS } from '@/lib/rcon'
import { verifyWebhook } from '@/lib/cryptobot'

interface CryptoBotUpdate {
  update_type?: string
  payload?: {
    invoice_id?: number
    payload?: string
    asset?: string
    amount?: string
    status?: string
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('crypto-pay-api-signature') ?? ''

  if (!verifyWebhook(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  let update: CryptoBotUpdate | null = null
  try {
    update = JSON.parse(rawBody) as CryptoBotUpdate
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (update.update_type !== 'invoice_paid') {
    // Ignore other update types but acknowledge receipt.
    return NextResponse.json({ message: 'Ignored' })
  }

  const inv = update.payload
  if (!inv || inv.status !== 'paid') {
    return NextResponse.json({ message: 'Not paid' })
  }

  const invoiceId = inv.invoice_id
  if (invoiceId === undefined) {
    return NextResponse.json({ error: 'No invoice_id' }, { status: 400 })
  }

  // Idempotency by paymentId
  const paymentId = `cryptobot_${invoiceId}`
  const existingByPaymentId = await getOrderByPaymentId(paymentId)
  if (
    existingByPaymentId &&
    ['delivered', 'delivery_failed', 'delivery_pending'].includes(existingByPaymentId.status)
  ) {
    return NextResponse.json({ message: 'Already processed' })
  }

  const publicId = inv.payload
  if (!publicId) {
    return NextResponse.json({ error: 'No payload' }, { status: 400 })
  }

  let order = await getOrder(publicId)
  if (!order) {
    order = (await getAllOrders()).find(o => o.id === publicId)
  }
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (['paid', 'delivery_pending', 'delivered', 'delivery_failed'].includes(order.status)) {
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
