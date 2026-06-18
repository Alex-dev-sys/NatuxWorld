import { NextResponse } from 'next/server'
import { getActiveProducts } from '@/lib/productStore'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getActiveProducts())
}
