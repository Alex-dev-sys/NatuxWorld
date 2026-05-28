import { NextRequest, NextResponse } from 'next/server'
import { validateCoupon } from '@/lib/coupons'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.json({ error: 'Код не указан' }, { status: 400 })
  }

  const coupon = validateCoupon(code)
  if (!coupon) {
    return NextResponse.json({ error: 'Промокод не найден или истёк' }, { status: 404 })
  }

  return NextResponse.json({ valid: true, ...coupon })
}
