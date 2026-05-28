import { NextRequest, NextResponse } from 'next/server'
import { getOrder } from '@/lib/store'

export async function GET(
  _req: NextRequest,
  { params }: { params: { publicId: string } }
) {
  const order = getOrder(params.publicId)
  if (!order) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }
  return NextResponse.json(order)
}
