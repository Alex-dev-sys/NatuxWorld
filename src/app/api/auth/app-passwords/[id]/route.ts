import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, authenticatedUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authenticatedUser(req.headers)
  if (!user) return apiError('token_invalid', 'Сессия истекла', 401)
  const userId = user.id
  await prisma.appPassword.deleteMany({ where: { id: params.id, userId } }) // scoped to owner
  return Response.json({ ok: true })
}
