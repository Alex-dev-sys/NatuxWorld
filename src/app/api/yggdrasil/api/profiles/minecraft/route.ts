import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { buildProfile } from '@/lib/yggdrasil'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return Response.json([]) }

  const names = Array.isArray(body) ? (body as unknown[]).filter((n): n is string => typeof n === 'string') : []
  if (names.length === 0) return Response.json([])

  const users = await prisma.user.findMany({
    where: { username: { in: names } },
    select: { username: true },
  })

  return Response.json(users.map((u) => buildProfile(u.username)))
}
