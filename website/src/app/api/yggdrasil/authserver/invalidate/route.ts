import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { hashGameToken } from '@/lib/gameTokens'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return new Response(null, { status: 204 }) }

  if (typeof body !== 'object' || body === null) return new Response(null, { status: 204 })
  const { accessToken } = body as Record<string, unknown>
  if (typeof accessToken === 'string' && accessToken) {
    // Tokens are stored as sha256 digests; deleting by the raw value would
    // silently no-op and leave the session usable on /join.
    await prisma.gameToken.deleteMany({ where: { accessToken: hashGameToken(accessToken) } }).catch(() => {})
  }
  return new Response(null, { status: 204 })
}
