import { NextRequest, NextResponse } from 'next/server'
import { getOrderById, updateOrder } from '@/lib/store'
import { requireAdmin } from '@/lib/adminAuth'
import { buildCommands, executeRcon, DURATION_DAYS } from '@/lib/rcon'
import { logAdminAction } from '@/lib/adminAudit'
import type { Duration } from '@/lib/types'

// Refund = mark the order refunded + revoke the granted rank via RCON.
// No money is moved here; the actual payout is handled out of band.
const REFUNDABLE = new Set(['paid', 'delivered', 'delivery_failed', 'delivery_pending'])

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const order = await getOrderById(params.id)
  if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  if (!REFUNDABLE.has(order.status)) {
    return NextResponse.json({ error: `Нельзя вернуть заказ в статусе ${order.status}` }, { status: 400 })
  }

  // Revoke the rank. buildCommands validates username/rank against the same
  // SAFE_* guards the delivery path uses before anything reaches RCON.
  let rconOk = false
  let rconError: string | undefined
  try {
    const commands = buildCommands(['lp user {username} parent remove {rank}'], {
      username: order.username,
      rank: order.productId,
      duration: order.variantDurationLabel,
      durationDays: DURATION_DAYS[order.variantDuration as Duration] ?? '?',
      orderId: order.id,
      price: order.price,
    })
    const result = await executeRcon(commands)
    rconOk = result.success
    rconError = result.error
  } catch (err) {
    rconError = err instanceof Error ? err.message : String(err)
  }

  const updated = await updateOrder(order.publicId, { status: 'refunded', deliveryError: rconOk ? undefined : rconError })
  await logAdminAction(req, 'order.refund', { target: order.publicId, params: { username: order.username, rank: order.productId, rconOk }, ok: true })
  return NextResponse.json({ order: updated, rconOk, rconError })
}
