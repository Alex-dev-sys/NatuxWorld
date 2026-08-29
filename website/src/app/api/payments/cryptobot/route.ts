// src/app/api/payments/cryptobot/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrder, getOrderById, getOrderByPaymentId, claimOrderForDelivery } from '@/lib/store'
import { fulfillOrder } from '@/lib/fulfillment'
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
  if (existingByPaymentId && existingByPaymentId.status === 'delivered') {
    return NextResponse.json({ message: 'Already processed' })
  }

  const publicId = inv.payload
  if (!publicId) {
    return NextResponse.json({ error: 'No payload' }, { status: 400 })
  }

  const order = (await getOrder(publicId)) ?? (await getOrderById(publicId))
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (
    inv.asset !== order.paymentAsset ||
    inv.amount !== order.paymentAmount
  ) {
    return NextResponse.json({ error: 'Payment asset or amount mismatch' }, { status: 403 })
  }

  // Атомарный захват: при конкурентных ретраях RCON выполнится только один раз.
  const claimed = await claimOrderForDelivery(order.publicId, paymentId)
  if (!claimed) {
    return NextResponse.json({ message: 'Already processed' })
  }

  const updated = await fulfillOrder(claimed)
  return NextResponse.json({ message: 'OK', order: updated })
}
