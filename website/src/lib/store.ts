// src/lib/store.ts
import { prisma } from './db'
import type { Order, OrderStatus, Duration, PublicOrder } from './types'

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
  paymentAsset: string | null
  paymentAmount: string | null
  createdAt: Date
  paidAt: Date | null
  deliveredAt: Date | null
  deliveryError: string | null
  fulfillmentCommands: string[]
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
    paymentAsset: row.paymentAsset === 'TON' || row.paymentAsset === 'USDT' ? row.paymentAsset : undefined,
    paymentAmount: row.paymentAmount ?? undefined,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString(),
    deliveryError: row.deliveryError ?? undefined,
    fulfillmentCommands: row.fulfillmentCommands,
    rconCommands: row.rconCommands,
  }
}

export function toPublicOrder(order: Order): PublicOrder {
  return {
    publicId: order.publicId,
    productName: order.productName,
    variantDuration: order.variantDuration,
    variantDurationLabel: order.variantDurationLabel,
    price: order.price,
    username: order.username,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    deliveredAt: order.deliveredAt,
    couponCode: order.couponCode,
    originalPrice: order.originalPrice,
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
      paymentAsset: order.paymentAsset ?? null,
      paymentAmount: order.paymentAmount ?? null,
      createdAt: new Date(order.createdAt),
      paidAt: order.paidAt ? new Date(order.paidAt) : null,
      deliveredAt: order.deliveredAt ? new Date(order.deliveredAt) : null,
      deliveryError: order.deliveryError ?? null,
      fulfillmentCommands: order.fulfillmentCommands ?? [],
      rconCommands: order.rconCommands ?? [],
    },
  })
}

/** Atomically records payment. Coupon exhaustion never rolls back a confirmed payment. */
export async function claimOrderForDelivery(
  publicId: string,
  paymentId: string
): Promise<Order | null> {
  return await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { publicId, status: { in: ['created', 'waiting_payment'] } },
        data: { status: 'delivery_pending', paidAt: new Date(), paymentId },
      })
      if (count === 0) return null

      const row = await tx.order.findUnique({ where: { publicId } })
      if (!row) return null
      let couponError: string | undefined
      if (row.couponCode) {
        const redeemed = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "code" = ${row.couponCode} AND "active" = true AND ("maxUses" IS NULL OR "usedCount" < "maxUses") AND ("expiresAt" IS NULL OR "expiresAt" > NOW())`
        if (redeemed !== 1) couponError = 'Coupon is no longer available; payment recorded at the confirmed amount'
      }
      if (couponError) {
        const updated = await tx.order.update({ where: { publicId }, data: { deliveryError: couponError } })
        return mapOrder(updated)
      }
      return mapOrder(row)
    })
}

export async function updateOrder(
  publicId: string,
  updates: Partial<Order>
): Promise<Order | null> {
  const data: Record<string, unknown> = {}
  if (updates.status !== undefined) data.status = updates.status
  if (updates.paymentId !== undefined) data.paymentId = updates.paymentId
  if (updates.paymentAsset !== undefined) data.paymentAsset = updates.paymentAsset ?? null
  if (updates.paymentAmount !== undefined) data.paymentAmount = updates.paymentAmount ?? null
  if (updates.paidAt !== undefined) data.paidAt = updates.paidAt ? new Date(updates.paidAt) : null
  if (updates.deliveredAt !== undefined) data.deliveredAt = updates.deliveredAt ? new Date(updates.deliveredAt) : null
  if (updates.deliveryError !== undefined) data.deliveryError = updates.deliveryError ?? null
  if (updates.fulfillmentCommands !== undefined) data.fulfillmentCommands = updates.fulfillmentCommands ?? []
  if (updates.rconCommands !== undefined) data.rconCommands = updates.rconCommands ?? []

  try {
    const row = await prisma.order.update({ where: { publicId }, data })
    return mapOrder(row)
  } catch (err) {
    console.error('[store] updateOrder failed:', publicId, err)
    return null
  }
}
