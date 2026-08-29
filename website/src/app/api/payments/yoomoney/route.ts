// src/app/api/payments/yoomoney/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { getOrder, getOrderById, getOrderByPaymentId, claimOrderForDelivery } from '@/lib/store'
import { fulfillOrder } from '@/lib/fulfillment'

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
  const expected = createHash('sha1').update(str).digest()
  const provided = Buffer.from(params.sha1_hash ?? '', 'hex')
  // timingSafeEqual требует одинаковую длину; сравнение константно по времени.
  if (provided.length !== expected.length) return false
  return timingSafeEqual(expected, provided)
}

export async function POST(req: NextRequest) {
  const text = await req.text()
  const params = Object.fromEntries(new URLSearchParams(text))

  const secret = process.env.YOOMONEY_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 403 })
  }
  if (!verifySha1(params, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  // Защищённые (codepro) и непринятые платежи — деньги фактически не получены.
  if (params.codepro === 'true' || params.unaccepted === 'true') {
    return NextResponse.json({ error: 'Payment not received (protected/unaccepted)' }, { status: 400 })
  }

  const operationId = params.operation_id
  if (!operationId) {
    return NextResponse.json({ error: 'No operation_id' }, { status: 400 })
  }

  // Idempotency by paymentId
  const paymentId = `ymoney_${operationId}`
  const existingByPaymentId = await getOrderByPaymentId(paymentId)
  if (existingByPaymentId && existingByPaymentId.status === 'delivered') {
    return NextResponse.json({ message: 'Already processed' })
  }

  const label = params.label
  if (!label) {
    return NextResponse.json({ error: 'No label' }, { status: 400 })
  }

  const order = (await getOrder(label)) ?? (await getOrderById(label))
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const paidAmount = parseFloat(params.amount ?? '0')
  if (paidAmount < order.price) {
    return NextResponse.json({ error: 'Insufficient amount' }, { status: 400 })
  }

  // Атомарный захват: при конкурентных ретраях RCON выполнится только один раз.
  const claimed = await claimOrderForDelivery(order.publicId, paymentId)
  if (!claimed) {
    return NextResponse.json({ message: 'Already processed' })
  }

  const updated = await fulfillOrder(claimed)
  return NextResponse.json({ message: 'OK', order: updated })
}
