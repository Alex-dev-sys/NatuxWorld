// src/lib/cryptobot.ts
import { createHmac, createHash, timingSafeEqual } from 'crypto'
import { getRates, toCryptoAmount } from './rates'

export type CryptoAsset = 'TON' | 'USDT'

export interface CryptoBotInvoice {
  invoice_id: number
  status: string
  pay_url: string
  amount: string
  asset: string
  payload?: string
}

interface CreateInvoiceParams {
  asset: CryptoAsset
  /** Price in RUB; converted to the crypto amount via live rates. */
  amountRub: number
  payload: string
  description?: string
  paidBtnUrl?: string
}

function apiBase(): string {
  const network = process.env.CRYPTO_BOT_NETWORK ?? 'mainnet'
  return network === 'testnet'
    ? 'https://testnet-pay.crypt.bot/api'
    : 'https://pay.crypt.bot/api'
}

function token(): string {
  const t = process.env.CRYPTO_BOT_TOKEN
  if (!t) {
    throw new Error('CRYPTO_BOT_TOKEN is not configured')
  }
  return t
}

interface CryptoBotResponse<T> {
  ok: boolean
  result?: T
  error?: { code: number; name: string }
}

export async function createInvoice(
  params: CreateInvoiceParams
): Promise<CryptoBotInvoice> {
  const rates = await getRates()
  const rate = params.asset === 'USDT' ? rates.usdt : rates.ton
  const amount = toCryptoAmount(params.amountRub, rate)

  const body: Record<string, string> = {
    asset: params.asset,
    amount,
    payload: params.payload,
  }
  if (params.description) body.description = params.description
  if (params.paidBtnUrl) {
    body.paid_btn_name = 'callback'
    body.paid_btn_url = params.paidBtnUrl
  }

  const res = await fetch(`${apiBase()}/createInvoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Crypto-Pay-API-Token': token(),
    },
    body: JSON.stringify(body),
    // Bounded call: a hanging provider must not stall the checkout request.
    signal: AbortSignal.timeout(10_000),
  })

  const data = (await res.json()) as CryptoBotResponse<CryptoBotInvoice>

  if (!res.ok || !data.ok || !data.result) {
    const name = data.error?.name ?? `HTTP ${res.status}`
    throw new Error(`CryptoBot createInvoice failed: ${name}`)
  }

  return data.result
}

/**
 * Verify webhook signature.
 * The `crypto-pay-api-signature` header is HMAC-SHA256 of the raw request body,
 * using a SHA256 hash of the API token as the secret key.
 */
export function verifyWebhook(rawBody: string, signature: string): boolean {
  if (!signature) return false

  const secret = createHash('sha256').update(token()).digest()
  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(signature, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
