import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { isUsableGameToken, hashGameToken } from '@/lib/gameTokens'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return new Response(null, { status: 403 }) }

  if (typeof body !== 'object' || body === null) return new Response(null, { status: 403 })
  const { accessToken, clientToken } = body as Record<string, unknown>
  if (typeof accessToken !== 'string' || !accessToken) return new Response(null, { status: 403 })
  if (clientToken !== undefined && typeof clientToken !== 'string') return new Response(null, { status: 403 })

  // Tokens are stored as sha256 digests; hash the presented raw value.
  const accessTokenHash = hashGameToken(accessToken)
  const token = await prisma.gameToken.findUnique({ where: { accessToken: accessTokenHash } })
  if (!token) return new Response(null, { status: 403 })
  if (clientToken && token.clientToken !== clientToken) return new Response(null, { status: 403 })
  const user = await prisma.user.findUnique({ where: { id: token.userId } })
  if (!user || !isUsableGameToken(token, user)) {
    await prisma.gameToken.deleteMany({ where: { accessToken: accessTokenHash } })
    return new Response(null, { status: 403 })
  }

  return new Response(null, { status: 204 })
}
