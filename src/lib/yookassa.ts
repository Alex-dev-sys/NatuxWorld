// src/lib/yookassa.ts

const API_URL = 'https://api.yookassa.ru/v3/payments'

export interface YooKassaPayment {
  id: string
  status: string
  confirmation: {
    type: string
    confirmation_url: string
  }
}

interface CreatePaymentParams {
  amountRub: number
  orderId: string
  description: string
  returnUrl: string
}

function shopId(): string {
  const id = process.env.YOOKASSA_SHOP_ID
  if (!id) {
    throw new Error('YOOKASSA_SHOP_ID is not configured')
  }
  return id
}

function secretKey(): string {
  const key = process.env.YOOKASSA_SECRET_KEY
  if (!key) {
    throw new Error('YOOKASSA_SECRET_KEY is not configured')
  }
  return key
}

function authHeader(): string {
  const credentials = `${shopId()}:${secretKey()}`
  return `Basic ${Buffer.from(credentials).toString('base64')}`
}

export async function createPayment(
  params: CreatePaymentParams
): Promise<YooKassaPayment> {
  const body = {
    amount: {
      value: params.amountRub.toFixed(2),
      currency: 'RUB',
    },
    capture: true,
    payment_method_data: {
      // bank_card confirmation page also exposes SBP automatically.
      type: 'bank_card',
    },
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    description: params.description,
    metadata: {
      publicId: params.orderId,
    },
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      // Idempotency key prevents duplicate charges on retry.
      'Idempotence-Key': params.orderId,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const data = (await res.json()) as YooKassaPayment & {
    type?: string
    description?: string
  }

  if (!res.ok || !data.id || !data.confirmation?.confirmation_url) {
    const reason = data.description ?? `HTTP ${res.status}`
    throw new Error(`YooKassa createPayment failed: ${reason}`)
  }

  return data
}

/**
 * Verify a YooKassa webhook.
 * YooKassa does not sign notifications, so the recommended approach is to
 * confirm the payment's recipient shop_id matches our own (and ideally
 * re-fetch the payment). Here we trust the supplied shop_id against env.
 */
export function verifyWebhook(shopIdFromBody: string | undefined): boolean {
  if (!shopIdFromBody) return false
  return shopIdFromBody === (process.env.YOOKASSA_SHOP_ID ?? '')
}
