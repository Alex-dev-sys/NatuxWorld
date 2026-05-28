import { NextResponse } from 'next/server'
import { products } from '@/lib/products'

export async function GET() {
  const active = products.filter(p => p.active).sort((a, b) => a.order - b.order)
  return NextResponse.json(active)
}
