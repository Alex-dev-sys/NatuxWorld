// src/app/api/admin/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAllOrders } from '@/lib/store'
import { requireAdmin } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }
  const orders = await getAllOrders()
  return NextResponse.json(orders)
}
