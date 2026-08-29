import { NextRequest, NextResponse } from 'next/server'
import { clientIp } from '@/lib/clientIp'
import { validateCoupon } from '@/lib/couponStore'
import { rateLimit } from '@/lib/ratelimit'

export async function GET(req: NextRequest) {
  const ip = clientIp(req)
  if (!rateLimit(`coupon:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 })
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.json({ error: 'Код не указан' }, { status: 400 })
  }

  const coupon = await validateCoupon(code)
  if (!coupon) {
    return NextResponse.json({ error: 'Промокод не найден или истёк' }, { status: 404 })
  }

  // Не раскрываем usedCount/maxUses наружу
  return NextResponse.json({
    valid: true,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    description: coupon.description,
  })
}
