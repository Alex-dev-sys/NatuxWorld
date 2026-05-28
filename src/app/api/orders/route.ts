import { NextRequest, NextResponse } from 'next/server'
import { products } from '@/lib/products'
import { saveOrder } from '@/lib/store'
import { validateCoupon, applyDiscount } from '@/lib/coupons'
import type { Order, Duration } from '@/lib/types'

const NICK_RE = /^[a-zA-Z0-9_]{3,16}$/

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: 'productId, duration, username are required' }, { status: 400 })
  }

  if (!NICK_RE.test(username)) {
    return NextResponse.json({ error: 'Некорректный Minecraft ник' }, { status: 400 })
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
    username: username.trim(),
    status: 'waiting_payment',
    createdAt: new Date().toISOString(),
    couponCode: appliedCoupon,
    originalPrice: appliedCoupon ? variant.price : undefined,
  }

  saveOrder(order)

  return NextResponse.json({ publicId: order.publicId }, { status: 201 })
}
