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
  paymentUrl?: string | null
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
    paymentUrl: row.paymentUrl ?? undefined,
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
    // Only while the order can still be paid: a checkout link is useless (and
    // misleading) once it is paid, delivered or cancelled.
    paymentUrl: ['created', 'waiting_payment'].includes(order.status) ? order.paymentUrl : undefined,
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

/** How long a delivery attempt may hold the order before another may reclaim it. */
export const DELIVERY_LEASE_MS = 5 * 60 * 1000

/**
 * Atomically takes ownership of an order for a manual retry. Only one caller can
 * win: the claim matches either a not-yet-running status, or a delivery_pending
 * order whose lease has expired (a crashed attempt). Losers get null and must
 * not touch RCON.
 */
export async function claimOrderForRetry(
  publicId: string,
  attemptId: string,
  opts: { allowStalePending: boolean }
): Promise<Order | null> {
  const now = new Date()
  const reclaimable = [
    { status: { in: ['paid', 'delivery_failed'] } },
    ...(opts.allowStalePending
      ? [{
          status: 'delivery_pending',
          OR: [{ deliveryLeaseUntil: null }, { deliveryLeaseUntil: { lt: now } }],
        }]
      : []),
  ]

  const { count } = await prisma.order.updateMany({
    where: { publicId, OR: reclaimable },
    data: {
      status: 'delivery_pending',
      deliveryError: null,
      deliveryAttemptId: attemptId,
      deliveryLeaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
      retryCount: { increment: 1 },
    },
  })
  if (count === 0) return null

  const row = await prisma.order.findUnique({ where: { publicId } })
  // Someone else may have re-claimed between the update and this read; only the
  // attempt still named on the row is allowed to proceed.
  if (!row || row.deliveryAttemptId !== attemptId) return null
  return mapOrder(row)
}

/**
 * Pushes the lease expiry back while an attempt is still working. RCON retries
 * can outlast DELIVERY_LEASE_MS, and without renewal a live attempt looked
 * abandoned and could be reclaimed underneath itself. Returns false once the
 * attempt no longer owns the order — the caller must then stop.
 */
export async function renewDeliveryLease(publicId: string, attemptId: string): Promise<boolean> {
  const { count } = await prisma.order
    .updateMany({
      where: { publicId, deliveryAttemptId: attemptId, deliveryLeaseUntil: { gt: new Date() } },
      data: { deliveryLeaseUntil: new Date(Date.now() + DELIVERY_LEASE_MS) },
    })
    .catch(() => ({ count: 0 }))
  return count === 1
}

/** Releases the lease once an attempt has finished, win or lose. */
export async function releaseDeliveryLease(publicId: string, attemptId: string): Promise<void> {
  await prisma.order
    .updateMany({
      where: { publicId, deliveryAttemptId: attemptId },
      data: { deliveryAttemptId: null, deliveryLeaseUntil: null },
    })
    .catch(() => {})
}

/** The lease owner id that claimOrderForDelivery assigns for a given payment. */
export function deliveryAttemptIdFor(paymentId: string): string {
  return `payment:${paymentId}`
}

/** Atomically records payment. Coupon exhaustion never rolls back a confirmed payment. */
export async function claimOrderForDelivery(
  publicId: string,
  paymentId: string,
  // Free activations redeem their coupon up front (before the order exists), so
  // they must not redeem it a second time here.
  opts: { redeemCoupon?: boolean } = {}
): Promise<Order | null> {
  const shouldRedeemCoupon = opts.redeemCoupon !== false
  return await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { publicId, status: { in: ['created', 'waiting_payment'] } },
        // Hold a lease too, so an admin retry cannot race the webhook's own
        // delivery. It expires on its own; a failed delivery leaves the order in
        // delivery_failed, which stays retryable regardless of the lease.
        data: {
          status: 'delivery_pending',
          paidAt: new Date(),
          paymentId,
          deliveryAttemptId: deliveryAttemptIdFor(paymentId),
          deliveryLeaseUntil: new Date(Date.now() + DELIVERY_LEASE_MS),
        },
      })
      if (count === 0) return null

      const row = await tx.order.findUnique({ where: { publicId } })
      if (!row) return null
      let couponError: string | undefined
      if (row.couponCode && shouldRedeemCoupon) {
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

/**
 * `deliveryError: null` CLEARS the stored message; omitting the key leaves it
 * untouched. Passing `undefined` used to mean "clear" at the call sites while
 * meaning "skip" here, so a successful retry kept showing the previous failure.
 */
export type OrderUpdate = Partial<Omit<Order, 'deliveryError' | 'paymentUrl'>> & {
  deliveryError?: string | null
  paymentUrl?: string | null
}

function buildOrderUpdateData(updates: OrderUpdate): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (updates.status !== undefined) data.status = updates.status
  if (updates.paymentId !== undefined) data.paymentId = updates.paymentId
  if (updates.paymentAsset !== undefined) data.paymentAsset = updates.paymentAsset ?? null
  if (updates.paymentAmount !== undefined) data.paymentAmount = updates.paymentAmount ?? null
  if (updates.paidAt !== undefined) data.paidAt = updates.paidAt ? new Date(updates.paidAt) : null
  if (updates.deliveredAt !== undefined) data.deliveredAt = updates.deliveredAt ? new Date(updates.deliveredAt) : null
  // Key presence, not value: `null` is a meaningful "clear this" instruction.
  if ('deliveryError' in updates) data.deliveryError = updates.deliveryError ?? null
  if (updates.fulfillmentCommands !== undefined) data.fulfillmentCommands = updates.fulfillmentCommands ?? []
  if (updates.rconCommands !== undefined) data.rconCommands = updates.rconCommands ?? []
  if ('paymentUrl' in updates) data.paymentUrl = updates.paymentUrl ?? null
  return data
}

export async function updateOrder(
  publicId: string,
  updates: OrderUpdate
): Promise<Order | null> {
  try {
    const row = await prisma.order.update({ where: { publicId }, data: buildOrderUpdateData(updates) })
    return mapOrder(row)
  } catch (err) {
    console.error('[store] updateOrder failed:', publicId, err)
    return null
  }
}

/**
 * Writes a delivery result ONLY while this attempt still owns the order. An
 * attempt whose lease lapsed and was reclaimed must not stamp its outcome over
 * the newer attempt's — returns null in that case, and the caller reports the
 * loss instead of a delivery.
 */
export async function updateOrderIfOwned(
  publicId: string,
  attemptId: string,
  updates: OrderUpdate
): Promise<Order | null> {
  try {
    const { count } = await prisma.order.updateMany({
      where: { publicId, deliveryAttemptId: attemptId },
      data: buildOrderUpdateData(updates),
    })
    if (count === 0) return null
    const row = await prisma.order.findUnique({ where: { publicId } })
    return row ? mapOrder(row) : null
  } catch (err) {
    console.error('[store] updateOrderIfOwned failed:', publicId, err)
    return null
  }
}
