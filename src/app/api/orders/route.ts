// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { products } from '@/lib/products'
import { saveOrder, updateOrder } from '@/lib/store'
import { validateCoupon, applyDiscount, isFree } from '@/lib/coupons'
import { executeRcon, buildCommands, DURATION_DAYS } from '@/lib/rcon'
import { rateLimit } from '@/lib/ratelimit'
import { createInvoice, type CryptoAsset } from '@/lib/cryptobot'
import { createPayment } from '@/lib/yookassa'
import type { Order, Duration } from '@/lib/types'

const NICK_RE = /^[a-zA-Z0-9_]{3,16}$/

function siteOrigin(): string {
  const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'localhost:3000'
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  return `${protocol}://${domain}`
}

function buildMockPaymentUrl(order: Order): string {
  return `${siteOrigin()}/pay/${order.publicId}`
}

async function buildCryptoBotUrl(order: Order, asset: CryptoAsset): Promise<string> {
  const invoice = await createInvoice({
    asset,
    amountRub: order.price,
    payload: order.publicId,
    description: `Ранг ${order.productName} (${order.variantDurationLabel}) на NATUX WORLD`,
    paidBtnUrl: `${siteOrigin()}/order/${order.publicId}`,
  })
  return invoice.pay_url
}

async function buildYooKassaUrl(order: Order): Promise<string> {
  const payment = await createPayment({
    amountRub: order.price,
    orderId: order.publicId,
    description: `Ранг ${order.productName} (${order.variantDurationLabel}) на NATUX WORLD [${order.publicId}]`,
    returnUrl: `${siteOrigin()}/order/${order.publicId}`,
  })
  return payment.confirmation.confirmation_url
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (!rateLimit(`orders:${ip}`, 10, 60_000)) {
    return NextResponse.json(
      { error: 'Слишком много запросов. Подождите минуту.' },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { productId, duration, username, couponCode, asset, paymentMethod } = body as {
    productId?: string
    duration?: string
    username?: string
    couponCode?: string
    asset?: string
    paymentMethod?: string
  }

  if (!productId || !duration || !username) {
    return NextResponse.json(
      { error: 'productId, duration и username обязательны' },
      { status: 400 }
    )
  }

  if (!NICK_RE.test(username)) {
    return NextResponse.json(
      { error: 'Некорректный Minecraft ник (3–16 символов, латиница, цифры, _)' },
      { status: 400 }
    )
  }

  const product = products.find(p => p.id === productId && p.active)
  if (!product) {
    return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })
  }

  const variant = product.variants.find(v => v.duration === duration)
  if (!variant) {
    return NextResponse.json({ error: 'Вариант не найден' }, { status: 404 })
  }

  let finalPrice = variant.price
  let appliedCoupon: string | undefined

  if (couponCode) {
    const coupon = validateCoupon(couponCode)
    if (coupon) {
      finalPrice = applyDiscount(variant.price, coupon)
      appliedCoupon = coupon.code
    }
  }

  const order: Order = {
    id: crypto.randomUUID(),
    publicId: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    variantDuration: duration as Duration,
    variantDurationLabel: variant.durationLabel,
    price: finalPrice,
    originalPrice: appliedCoupon ? variant.price : undefined,
    couponCode: appliedCoupon,
    username: username.trim(),
    status: 'waiting_payment',
    createdAt: new Date().toISOString(),
  }

  await saveOrder(order)

  // Бесплатный промокод — пропускаем оплату и сразу выдаём ранг
  if (couponCode) {
    const coupon = validateCoupon(couponCode)
    if (coupon && isFree(coupon)) {
      // Строгий лимит: 2 бесплатных ранга в час с одного IP
      if (!rateLimit(`free:${ip}`, 2, 60 * 60_000)) {
        return NextResponse.json({ error: 'Лимит бесплатных активаций превышен' }, { status: 429 })
      }
      const commands = buildCommands(variant.commands, {
        username: order.username,
        rank: product.name,
        duration: variant.durationLabel,
        durationDays: DURATION_DAYS[variant.duration as Duration],
        orderId: order.publicId,
        price: 0,
      })
      const result = await executeRcon(commands)
      await updateOrder(order.publicId, {
        status: result.success ? 'delivered' : 'delivery_failed',
        paidAt: new Date().toISOString(),
        deliveredAt: result.success ? new Date().toISOString() : undefined,
        deliveryError: result.error,
        rconCommands: commands,
      })
      return NextResponse.json(
        { publicId: order.publicId, paymentUrl: `${siteOrigin()}/order/${order.publicId}` },
        { status: 201 }
      )
    }
  }

  const provider = process.env.PAYMENT_PROVIDER ?? 'mock'

  // The buyer wants crypto if they picked TON/USDT (via paymentMethod or asset);
  // otherwise they chose card/СБП (paymentMethod === 'card').
  const wantsCard = paymentMethod === 'card'
  const wantsCrypto = !wantsCard && (asset === 'TON' || asset === 'USDT' || paymentMethod === 'TON' || paymentMethod === 'USDT')
  const cryptoAsset: CryptoAsset =
    asset === 'USDT' || paymentMethod === 'USDT' ? 'USDT' : 'TON'

  // Resolve which gateway to actually use for this order.
  let resolvedProvider: 'cryptobot' | 'yookassa' | 'mock'
  if (provider === 'cryptobot') {
    resolvedProvider = 'cryptobot'
  } else if (provider === 'yookassa') {
    resolvedProvider = 'yookassa'
  } else if (provider === 'multi') {
    resolvedProvider = wantsCrypto ? 'cryptobot' : 'yookassa'
  } else {
    resolvedProvider = 'mock'
  }

  let paymentUrl: string
  try {
    if (resolvedProvider === 'cryptobot') {
      paymentUrl = await buildCryptoBotUrl(order, cryptoAsset)
    } else if (resolvedProvider === 'yookassa') {
      paymentUrl = await buildYooKassaUrl(order)
    } else {
      paymentUrl = buildMockPaymentUrl(order)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось создать счёт на оплату'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  return NextResponse.json({ publicId: order.publicId, paymentUrl }, { status: 201 })
}
