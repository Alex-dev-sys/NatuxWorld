import { NextResponse } from 'next/server'
import { getAllOrders } from '@/lib/store'

// In production: protect with session/JWT auth middleware
export async function GET() {
  const orders = getAllOrders()
  return NextResponse.json(orders)
}
