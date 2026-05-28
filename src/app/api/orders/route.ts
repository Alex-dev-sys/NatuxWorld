import { NextRequest, NextResponse } from 'next/server'
import { products } from '@/lib/products'
import { saveOrder } from '@/lib/store'
import { validateCoupon, applyDiscount } from '@/lib/coupons'
import { rateLimit } from '@/lib/ratelimit'
import type { Order, Duration } from '@/lib/types'

const NICK_RE = /^[a-zA-Z0-9_]{3,16}$/

export async function POST(req: NextRequest) {
  // Rate limit: 10 orders per minute per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'

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
    return NextResponse.json({ error: 'Некорректный Minecraft ник (3–16 символов, латиница, цифры, _)' }, { status: 400 })
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
    // silently ignore unknown coupons (already validated on frontend)
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

  saveOrder(order)

  // TODO: create real payment in payment provider, return paymentUrl
  return NextResponse.json({ publicId: order.publicId }, { status: 201 })
}
