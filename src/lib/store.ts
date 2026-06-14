// src/lib/store.ts
import { prisma } from './db'
import { redeemCoupon } from './couponStore'
import type { Order, OrderStatus, Duration } from './types'

function mapOrder(row: {
  id: string
  publicId: string
  productId: string
  productName: string
  variantDuration: string
  variantDurationLabel: string
  price: number
  originalPrice: number | null
  couponCode: string | null
  username: string
  status: string
  paymentId: string | null
  createdAt: Date
  paidAt: Date | null
  deliveredAt: Date | null
  deliveryError: string | null
  rconCommands: string[]
  retryCount: number
}): Order {
  return {
    id: row.id,
    publicId: row.publicId,
    productId: row.productId,
    productName: row.productName,
    variantDuration: row.variantDuration as Duration,
    variantDurationLabel: row.variantDurationLabel,
    price: row.price,
    originalPrice: row.originalPrice ?? undefined,
    couponCode: row.couponCode ?? undefined,
    username: row.username,
    status: row.status as OrderStatus,
    paymentId: row.paymentId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString(),
    deliveryError: row.deliveryError ?? undefined,
    rconCommands: row.rconCommands,
  }
}

export async function getOrder(publicId: string): Promise<Order | undefined> {
  const row = await prisma.order.findUnique({ where: { publicId } })
  return row ? mapOrder(row) : undefined
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const row = await prisma.order.findUnique({ where: { id } })
  return row ? mapOrder(row) : undefined
}

export async function getOrderByPaymentId(paymentId: string): Promise<Order | undefined> {
  const row = await prisma.order.findUnique({ where: { paymentId } })
  return row ? mapOrder(row) : undefined
}

export async function getAllOrders(): Promise<Order[]> {
  const rows = await prisma.order.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(mapOrder)
}

export async function saveOrder(order: Order): Promise<void> {
  await prisma.order.create({
    data: {
      id: order.id,
      publicId: order.publicId,
      productId: order.productId,
      productName: order.productName,
      variantDuration: order.variantDuration,
      variantDurationLabel: order.variantDurationLabel,
      price: order.price,
      originalPrice: order.originalPrice ?? null,
      couponCode: order.couponCode ?? null,
      username: order.username,
      status: order.status,
      paymentId: order.paymentId ?? null,
      createdAt: new Date(order.createdAt),
      paidAt: order.paidAt ? new Date(order.paidAt) : null,
      deliveredAt: order.deliveredAt ? new Date(order.deliveredAt) : null,
      deliveryError: order.deliveryError ?? null,
      rconCommands: order.rconCommands ?? [],
    },
  })
}

// Атомарный «захват» заказа на выдачу: переводит created/waiting_payment в
// delivery_pending одним updateMany. Конкурентные вебхуки получат count === 0
// и не выполнят RCON повторно.
export async function claimOrderForDelivery(
  publicId: string,
  paymentId: string
): Promise<Order | null> {
  const { count } = await prisma.order.updateMany({
    where: { publicId, status: { in: ['created', 'waiting_payment'] } },
    data: { status: 'delivery_pending', paidAt: new Date(), paymentId },
  })
  if (count === 0) return null
  const order = (await getOrder(publicId)) ?? null
  // Лимит купона списываем по факту оплаты. Если код исчерпался между
  // созданием заказа и оплатой, заказ всё равно выдаётся — деньги получены.
  if (order?.couponCode) {
    await redeemCoupon(order.couponCode).catch(() => false)
  }
  return order
}

export async function updateOrder(
  publicId: string,
  updates: Partial<Order>
): Promise<Order | null> {
  const data: Record<string, unknown> = {}
  if (updates.status !== undefined) data.status = updates.status
  if (updates.paymentId !== undefined) data.paymentId = updates.paymentId
  if (updates.paidAt !== undefined) data.paidAt = updates.paidAt ? new Date(updates.paidAt) : null
  if (updates.deliveredAt !== undefined) data.deliveredAt = updates.deliveredAt ? new Date(updates.deliveredAt) : null
  if (updates.deliveryError !== undefined) data.deliveryError = updates.deliveryError ?? null
  if (updates.rconCommands !== undefined) data.rconCommands = updates.rconCommands ?? []

  try {
    const row = await prisma.order.update({ where: { publicId }, data })
    return mapOrder(row)
  } catch (err) {
    console.error('[store] updateOrder failed:', publicId, err)
    return null
  }
}
