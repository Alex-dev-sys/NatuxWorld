// src/app/api/auth/logout/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, apiError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Bumping tokenVersion invalidates every JWT previously issued to this user.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return apiError('token_invalid', 'Сессия истекла', 401)

  let claims: { sub: string; tv: number }
  try { claims = verifyToken(token) } catch { return apiError('token_invalid', 'Сессия истекла', 401) }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } })
  if (!user || user.tokenVersion !== claims.tv) return apiError('token_invalid', 'Сессия истекла', 401)

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } }),
    prisma.gameToken.deleteMany({ where: { userId: user.id } }),
  ])
  return Response.json({ ok: true })
}
