import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { isUsableGameToken } from '@/lib/gameTokens'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return new Response(null, { status: 403 }) }

  const { accessToken, clientToken } = body as Record<string, string>
  if (!accessToken) return new Response(null, { status: 403 })

  const token = await prisma.gameToken.findUnique({ where: { accessToken } })
  if (!token) return new Response(null, { status: 403 })
  if (clientToken && token.clientToken !== clientToken) return new Response(null, { status: 403 })
  const user = await prisma.user.findUnique({ where: { id: token.userId } })
  if (!user || !isUsableGameToken(token, user)) {
    await prisma.gameToken.deleteMany({ where: { accessToken } })
    return new Response(null, { status: 403 })
  }

  return new Response(null, { status: 204 })
}
