import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Used by Docker and an external uptime monitor. Do not include error details:
// they can expose database topology or credentials through a public endpoint.
export const dynamic = 'force-dynamic'

async function databaseIsReady(): Promise<boolean> {
  try {
    // The query is a constant, not user input. Use Prisma's string form here
    // so the readiness probe stays straightforward to exercise in isolation.
    const result = await prisma.$queryRawUnsafe('SELECT 1')
    return Array.isArray(result)
  } catch {
    return false
  }
}

export async function GET() {
  if (await databaseIsReady()) {
    return NextResponse.json(
      { status: 'ok', database: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return NextResponse.json(
    { status: 'unavailable', database: 'unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
