// src/app/api/admin/orders/route.ts
import { NextResponse } from 'next/server'
import { getAllOrders } from '@/lib/store'

export async function GET() {
  const orders = await getAllOrders()
  return NextResponse.json(orders)
}
