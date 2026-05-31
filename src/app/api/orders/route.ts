// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { products } from '@/lib/products'
import { saveOrder } from '@/lib/store'
import { validateCoupon, applyDiscount } from '@/lib/coupons'
import { rateLimit } from '@/lib/ratelimit'
import type { Order, Duration } from '@/lib/types'

const NICK_RE = /^[a-zA-Z0-9_]{3,16}$/

function buildYooMoneyUrl(order: Order): string {
  const wallet = process.env.YOOMONEY_WALLET ?? ''
  const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'localhost:3000'
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const params = new URLSearchParams({
    receiver: wallet,
    'quickpay-form': 'shop',
    targets: `Ранг ${order.productName} (${order.variantDurationLabel}) на NATUX WORLD`,
    sum: String(order.price),
    label: order.publicId,
    successURL: `${protocol}://${domain}/order/${order.publicId}`,
    failURL: `${protocol}://${domain}/order/${order.publicId}`,
  })
  return `https://yoomoney.ru/quickpay/confirm.xml?${params.toString()}`
}

function buildMockPaymentUrl(order: Order): string {
  const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'localhost:3000'
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  return `${protocol}://${domain}/pay/${order.publicId}`
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

  const { productId, duration, username, couponCode } = body as {
    productId?: string
    duration?: string
    username?: string
    couponCode?: string
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

  const provider = process.env.PAYMENT_PROVIDER ?? 'mock'
  const paymentUrl =
    provider === 'yoomoney'
      ? buildYooMoneyUrl(order)
      : buildMockPaymentUrl(order)

  return NextResponse.json({ publicId: order.publicId, paymentUrl }, { status: 201 })
}
