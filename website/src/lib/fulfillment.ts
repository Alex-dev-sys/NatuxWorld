// src/lib/fulfillment.ts
// Единая точка выдачи заказа: RCON-команды + финальный статус.
import { getProductById } from './productStore'
import { buildCommands, executeRcon, DURATION_DAYS } from './rcon'
import { updateOrder, updateOrderIfOwned, renewDeliveryLease, DELIVERY_LEASE_MS } from './store'
import type { OrderUpdate } from './store'
import type { Order } from './types'

/** Renew well before expiry so a slow RCON run never looks abandoned. */
const LEASE_RENEW_MS = Math.floor(DELIVERY_LEASE_MS / 3)

/**
 * `attemptId` is the delivery lease this call holds. Every write is then
 * conditional on still owning it, so an attempt that stalled past its lease and
 * was reclaimed cannot overwrite the newer attempt's result. Callers that hold
 * no lease (legacy paths) pass nothing and get the unguarded behaviour.
 */
export async function fulfillOrder(order: Order, attemptId?: string): Promise<Order | null> {
  const write = (updates: OrderUpdate): Promise<Order | null> =>
    attemptId
      ? updateOrderIfOwned(order.publicId, attemptId, updates)
      : updateOrder(order.publicId, updates)

  let templates = order.fulfillmentCommands ?? []

  // Backward compatibility for orders created before fulfillment snapshots existed.
  // New orders never consult the mutable catalog during delivery.
  if (templates.length === 0) {
    const product = await getProductById(order.productId)
    const variant = product?.variants.find(v => v.duration === order.variantDuration)
    templates = variant?.commands ?? []
  }

  if (templates.length === 0) {
    return write({
      status: 'delivery_failed',
      deliveryError: `Вариант товара не найден: ${order.productId}/${order.variantDuration}`,
      rconCommands: [],
    })
  }

  const commands = buildCommands(templates, {
    username: order.username,
    rank: order.productId,
    duration: order.variantDurationLabel,
    durationDays: DURATION_DAYS[order.variantDuration] ?? '?',
    orderId: order.id,
    price: order.price,
  })

  // Resume after the part a previous attempt confirmed executed, so a retry
  // cannot re-apply a grant that already took effect (a second `addtemp
  // ... accumulate` would silently extend the rank twice). Only a stored prefix
  // that still matches the freshly built list is trusted as progress.
  const done = order.rconCommands ?? []
  const alreadyDone = done.length <= commands.length && done.every((cmd, i) => cmd === commands[i])
    ? done.length
    : 0

  // Keep the lease alive for as long as RCON is actually working. Without this
  // a run that outlived DELIVERY_LEASE_MS (retries and backoff alone can) became
  // reclaimable while still sending commands.
  // Loss is sticky: a later successful DB response must not revive an attempt
  // that already failed to prove ownership. Share overlapping heartbeat/send
  // checks, and recheck immediately before each command reaches RCON.
  let leaseLost = false
  let renewal: Promise<boolean> | undefined
  const canSend = async (): Promise<boolean> => {
    if (!attemptId) return true
    if (leaseLost) return false
    if (!renewal) {
      renewal = renewDeliveryLease(order.publicId, attemptId)
        .catch(() => false)
        .then(ok => { if (!ok) leaseLost = true; return !leaseLost })
        .finally(() => { renewal = undefined })
    }
    return renewal
  }
  const renew = attemptId
    ? setInterval(() => { void canSend() }, LEASE_RENEW_MS)
    : null

  let result
  try {
    result = await executeRcon(commands, alreadyDone, attemptId ? canSend : undefined)
  } finally {
    if (renew) clearInterval(renew)
  }

  if (result.success) {
    const saved = await write({
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      rconCommands: result.commands,
      // Explicit null clears any message left by the failed attempt.
      deliveryError: null,
    })
    if (!saved && attemptId) {
      console.error('[fulfillment] lost the delivery lease before recording success:', order.publicId)
    }
    return saved
  }

  // A command interrupted mid-flight has an unknown outcome; say so instead of
  // letting the next retry treat it as either done or safely repeatable.
  const error = result.unknownCommand
    ? `${result.error} | Неизвестен результат команды: ${result.unknownCommand}`
    : result.error

  return write({
    status: 'delivery_failed',
    deliveryError: error,
    rconCommands: result.commands,
  })
}
