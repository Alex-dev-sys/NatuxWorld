import { NextRequest, NextResponse } from 'next/server'
import { products } from '@/lib/products'
import { saveOrder } from '@/lib/store'
import type { Order, Duration } from '@/lib/types'

const NICK_RE = /^[a-zA-Z0-9_]{3,16}$/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { productId, duration, username } = body as {
    productId?: string
    duration?: string
    username?: string
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

  const id = crypto.randomUUID()
  const publicId = crypto.randomUUID()

  const order: Order = {
    id,
    publicId,
    productId: product.id,
    productName: product.name,
    variantDuration: duration as Duration,
    variantDurationLabel: variant.durationLabel,
    price: variant.price,
    username: username.trim(),
    status: 'waiting_payment',
    createdAt: new Date().toISOString(),
  }

  saveOrder(order)

  // In production: create payment in payment provider here
  // const paymentUrl = await createPayment(order)
  // return NextResponse.json({ publicId, paymentUrl })

  return NextResponse.json({ publicId }, { status: 201 })
}
