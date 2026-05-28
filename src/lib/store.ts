import type { Order } from './types'

// In-memory store (replace with PostgreSQL + Prisma in production)
declare global {
  // eslint-disable-next-line no-var
  var __ordersStore: Map<string, Order> | undefined
}

function getStore(): Map<string, Order> {
  if (!global.__ordersStore) {
    global.__ordersStore = new Map()
  }
  return global.__ordersStore
}

export function getOrder(publicId: string): Order | undefined {
  return getStore().get(publicId)
}

export function getAllOrders(): Order[] {
  return Array.from(getStore().values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export function saveOrder(order: Order): void {
  getStore().set(order.publicId, order)
}

export function updateOrder(publicId: string, updates: Partial<Order>): Order | null {
  const store = getStore()
  const order = store.get(publicId)
  if (!order) return null
  const updated = { ...order, ...updates }
  store.set(publicId, updated)
  return updated
}
