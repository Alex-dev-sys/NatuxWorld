// src/app/api/payments/webhook/mock/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrder, getOrderById, claimOrderForDelivery } from '@/lib/store'
import { fulfillOrder } from '@/lib/fulfillment'

export async function POST(req: NextRequest) {
  // Мок-вебхук доступен ТОЛЬКО при PAYMENT_PROVIDER=mock: иначе любой желающий
  // мог бы пометить чужой заказ оплаченным и получить ранг бесплатно.
  if ((process.env.PAYMENT_PROVIDER ?? 'mock') !== 'mock') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { orderId, publicId } = body as { orderId?: string; publicId?: string }

  const key = publicId ?? orderId
  const order = key ? (await getOrder(key)) ?? (await getOrderById(key)) : undefined
  if (!order) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }

  const claimed = await claimOrderForDelivery(order.publicId, `mock_${Date.now()}`)
  if (!claimed) {
    return NextResponse.json({ message: 'Уже обработан', order })
  }

  const updated = await fulfillOrder(claimed)
  return NextResponse.json({ message: 'Обработан', order: updated })
}
