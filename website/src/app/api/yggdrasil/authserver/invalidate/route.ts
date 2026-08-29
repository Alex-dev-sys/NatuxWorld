import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return new Response(null, { status: 204 }) }

  const { accessToken } = body as Record<string, string>
  if (accessToken) {
    await prisma.gameToken.deleteMany({ where: { accessToken } }).catch(() => {})
  }
  return new Response(null, { status: 204 })
}
