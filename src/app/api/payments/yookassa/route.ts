// src/app/api/payments/yookassa/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrder, getOrderById, getOrderByPaymentId, claimOrderForDelivery } from '@/lib/store'
import { fulfillOrder } from '@/lib/fulfillment'
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

  // YooKassa notifications are not signed. Treat the notification as a wake-up
  // signal only and use the authenticated API response as the sole source of truth.
  const verifiedPayment = await verifyPayment(payment.id)
  if (!verifiedPayment) {
    return NextResponse.json({ error: 'Payment not confirmed by YooKassa' }, { status: 403 })
  }

  // Idempotency by paymentId
  const paymentId = `yookassa_${payment.id}`
  const existingByPaymentId = await getOrderByPaymentId(paymentId)
  if (existingByPaymentId && existingByPaymentId.status === 'delivered') {
    return NextResponse.json({ message: 'Already processed' })
  }

  // Never trust metadata/description from the caller-controlled webhook body.
  const publicId = verifiedPayment.metadata?.publicId
  if (!publicId) {
    return NextResponse.json({ error: 'No publicId' }, { status: 400 })
  }

  const order = (await getOrder(publicId)) ?? (await getOrderById(publicId))
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const expectedAmount = order.price.toFixed(2)
  if (
    verifiedPayment.amount?.currency !== 'RUB' ||
    verifiedPayment.amount?.value !== expectedAmount
  ) {
    return NextResponse.json({ error: 'Payment amount or currency mismatch' }, { status: 403 })
  }

  // Атомарный захват: при конкурентных ретраях RCON выполнится только один раз.
  const claimed = await claimOrderForDelivery(order.publicId, paymentId)
  if (!claimed) {
    return NextResponse.json({ message: 'Already processed' })
  }

  const updated = await fulfillOrder(claimed)
  return NextResponse.json({ message: 'OK', order: updated })
}
