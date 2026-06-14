declare global {
  // eslint-disable-next-line no-var
  var __rateLimit: Map<string, { count: number; resetAt: number }> | undefined
}

function getStore() {
  if (!global.__rateLimit) global.__rateLimit = new Map()
  return global.__rateLimit
}

/** Returns true if allowed, false if rate limited */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const store = getStore()

  // Lazy sweep: evict expired entries so the map doesn't grow unbounded
  if (store.size > 10_000) {
    for (const [k, v] of store) {
      if (v.resetAt < now) store.delete(k)
    }
  }

  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}
