import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { buildProfile } from '@/lib/yggdrasil'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 32 * 1024) return Response.json([], { status: 413 })

  let body: unknown
  try {
    const rawBody = await req.text()
    if (rawBody.length > 32 * 1024) return Response.json([], { status: 413 })
    body = JSON.parse(rawBody)
  } catch { return Response.json([]) }

  const names = Array.isArray(body) ? (body as unknown[]).filter((n): n is string => typeof n === 'string') : []
  if (names.length === 0 || names.length > 100) return Response.json([])

  const users = await prisma.user.findMany({
    where: { username: { in: names }, emailVerified: true, bannedAt: null },
    select: { username: true },
  })

  return Response.json(users.map((u: { username: string }) => buildProfile(u.username)))
}
