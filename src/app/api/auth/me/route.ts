import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, formatUser, apiError } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return apiError('token_invalid', 'Сессия истекла', 401)

  let claims: { sub: string; tv: number }
  try {
    claims = verifyToken(token)
  } catch {
    return apiError('token_invalid', 'Сессия истекла', 401)
  }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } })
  if (!user || user.tokenVersion !== claims.tv) return apiError('token_invalid', 'Сессия истекла', 401)

  return Response.json({ user: formatUser(user) })
}
