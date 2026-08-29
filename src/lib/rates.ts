// src/lib/rates.ts

export interface Rates {
  /** Price of 1 TON in RUB */
  ton: number
  /** Price of 1 USDT in RUB */
  usdt: number
}

export interface RatesWithMeta extends Rates {
  updatedAt: string
}

const TTL_MS = 5 * 60 * 1000
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network,tether&vs_currencies=rub'

interface CacheEntry {
  rates: Rates
  fetchedAt: number
}

let cache: CacheEntry | null = null
let inflight: Promise<Rates> | null = null

interface CoinGeckoResponse {
  'the-open-network'?: { rub?: number }
  tether?: { rub?: number }
}

async function fetchRates(): Promise<Rates> {
  const res = await fetch(COINGECKO_URL, {
    headers: { Accept: 'application/json' },
    // never reuse Next.js fetch cache; we manage caching in-memory
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`CoinGecko HTTP ${res.status}`)
  }

  const data = (await res.json()) as CoinGeckoResponse
  const ton = data['the-open-network']?.rub
  const usdt = data.tether?.rub

  if (typeof ton !== 'number' || typeof usdt !== 'number' || ton <= 0 || usdt <= 0) {
    throw new Error('CoinGecko returned invalid rates')
  }

  return { ton, usdt }
}

/**
 * Returns current TON/USDT prices in RUB.
 * Cached in-memory for 5 minutes. A failed refresh is returned to the caller
 * instead of silently creating an invoice at an unsafe/stale price.
 */
export async function getRates(): Promise<Rates> {
  const now = Date.now()

  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.rates
  }

  if (inflight) {
    return inflight
  }

  inflight = (async () => {
    try {
      const rates = await fetchRates()
      cache = { rates, fetchedAt: Date.now() }
      return rates
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** Returns rates plus the timestamp they were (re)fetched. */
export async function getRatesWithMeta(): Promise<RatesWithMeta> {
  const rates = await getRates()
  const fetchedAt = cache?.fetchedAt ?? Date.now()
  return { ...rates, updatedAt: new Date(fetchedAt).toISOString() }
}

/**
 * Convert a RUB price to a crypto amount string.
 * Rounds to 2 decimals, enforces a 0.01 minimum.
 */
export function toCryptoAmount(rubPrice: number, rate: number): string {
  const amount = rubPrice / rate
  const rounded = Math.max(0.01, Math.round(amount * 100) / 100)
  return rounded.toFixed(2)
}
