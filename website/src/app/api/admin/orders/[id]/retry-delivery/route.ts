// src/app/api/admin/orders/[id]/retry-delivery/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getOrderById, updateOrder } from '@/lib/store'
import { fulfillOrder } from '@/lib/fulfillment'
import { requireAdmin } from '@/lib/adminAuth'
import { logAdminAction } from '@/lib/adminAudit'

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

  // A crash mid-delivery leaves delivery_pending with partially unknown RCON
  // progress. The RCON client checkpoints executed commands, but re-attempting
  // a possibly-partial grant is an admin decision — require explicit confirm.
  const body = await _req.json().catch(() => ({})) as { confirm?: boolean }
  if (order.status === 'delivery_pending' && body.confirm !== true) {
    return NextResponse.json(
      { needConfirm: true, error: 'Предыдущая попытка могла выполниться частично. Повторите с confirm: true.' },
      { status: 400 },
    )
  }

  const pending = await updateOrder(order.publicId, { status: 'delivery_pending', deliveryError: undefined })
  if (!pending) {
    return NextResponse.json({ error: 'Ошибка обновления заказа' }, { status: 500 })
  }

  const updated = await fulfillOrder(pending)
  await logAdminAction(_req, 'order.retry-delivery', { target: order.publicId, params: { status: updated?.status }, ok: updated?.status === 'delivered' })
  return NextResponse.json({ order: updated })
}
