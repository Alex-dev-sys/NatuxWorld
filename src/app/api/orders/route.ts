// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getProductById } from '@/lib/productStore'
import { saveOrder, updateOrder } from '@/lib/store'
import { applyDiscount, isFree } from '@/lib/coupons'
import { validateCoupon, redeemCoupon } from '@/lib/couponStore'
import { fulfillOrder } from '@/lib/fulfillment'
import { rateLimit } from '@/lib/ratelimit'
import { createInvoice, type CryptoAsset } from '@/lib/cryptobot'
import { createPayment } from '@/lib/yookassa'
import type { Coupon, Order, Duration } from '@/lib/types'

const NICK_RE = /^[a-zA-Z0-9_]{3,16}$/
const DURATIONS: Duration[] = ['30d', '90d', 'forever']

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

  if (!DURATIONS.includes(duration as Duration)) {
    return NextResponse.json({ error: 'Некорректная длительность' }, { status: 400 })
  }
  const orderDuration = duration as Duration

  const product = await getProductById(productId)
  if (!product || !product.active) {
    return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })
  }

  const variant = product.variants.find(v => v.duration === orderDuration)
  if (!variant) {
    return NextResponse.json({ error: 'Вариант не найден' }, { status: 404 })
  }

  // Промокод валидируем один раз и ДО создания заказа: несуществующий код —
  // это ошибка, а не молчаливое списание полной цены.
  let coupon: Coupon | null = null
  let finalPrice = variant.price

  if (couponCode) {
    coupon = await validateCoupon(couponCode)
    if (!coupon) {
      return NextResponse.json({ error: 'Промокод не найден или истёк' }, { status: 400 })
    }
    finalPrice = applyDiscount(variant.price, coupon)
  }

  // Строгий лимит на бесплатные активации проверяем ДО сохранения заказа,
  // чтобы не плодить заказы-сироты.
  if (coupon && isFree(coupon)) {
    if (!rateLimit(`free:${ip}`, 2, 60 * 60_000)) {
      return NextResponse.json({ error: 'Лимит бесплатных активаций превышен' }, { status: 429 })
    }
  }

  // Бесплатный код списываем сразу (выдача мгновенная). Платные купоны
  // списываются в момент оплаты (claimOrderForDelivery), чтобы брошенные
  // неоплаченные заказы не выжигали maxUses.
  if (coupon && isFree(coupon)) {
    const redeemed = await redeemCoupon(coupon.code)
    if (!redeemed) {
      return NextResponse.json({ error: 'Промокод больше не действует' }, { status: 400 })
    }
  }

  const order: Order = {
    id: crypto.randomUUID(),
    publicId: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    variantDuration: orderDuration,
    variantDurationLabel: variant.durationLabel,
    price: finalPrice,
    originalPrice: coupon ? variant.price : undefined,
    couponCode: coupon?.code,
    username: username.trim(),
    status: 'waiting_payment',
    createdAt: new Date().toISOString(),
  }

  await saveOrder(order)

  // Бесплатный промокод — пропускаем оплату и сразу выдаём ранг
  if (coupon && isFree(coupon)) {
    const paid = await updateOrder(order.publicId, {
      status: 'delivery_pending',
      paidAt: new Date().toISOString(),
      paymentId: `free_${order.publicId}`,
    })
    if (!paid) {
      return NextResponse.json({ error: 'Ошибка обновления заказа' }, { status: 500 })
    }
    await fulfillOrder(paid)
    return NextResponse.json(
      { publicId: order.publicId, paymentUrl: `${siteOrigin()}/order/${order.publicId}` },
      { status: 201 }
    )
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
