// src/app/api/rates/route.ts
import { NextResponse } from 'next/server'
import { getRatesWithMeta } from '@/lib/rates'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { ton, usdt, updatedAt } = await getRatesWithMeta()
  return NextResponse.json({ ton, usdt, updatedAt })
}
