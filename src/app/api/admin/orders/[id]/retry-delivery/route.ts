// src/app/api/admin/orders/[id]/retry-delivery/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrderById, updateOrder } from '@/lib/store'
import { fulfillOrder } from '@/lib/fulfillment'
import { requireAdmin } from '@/lib/adminAuth'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin(_req))) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }
  const order = await getOrderById(params.id)
  if (!order) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }

  if (!['paid', 'delivery_failed', 'delivery_pending'].includes(order.status)) {
    return NextResponse.json({ error: 'Нельзя повторить выдачу для этого статуса' }, { status: 400 })
  }

  const pending = await updateOrder(order.publicId, { status: 'delivery_pending', deliveryError: undefined })
  if (!pending) {
    return NextResponse.json({ error: 'Ошибка обновления заказа' }, { status: 500 })
  }

  const updated = await fulfillOrder(pending)
  return NextResponse.json({ order: updated })
}
