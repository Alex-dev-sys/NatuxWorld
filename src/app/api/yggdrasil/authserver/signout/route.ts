import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return new Response(null, { status: 204 }) }

  const { username, password } = body as Record<string, string>
  if (!username || !password) return new Response(null, { status: 204 })

  const isEmail = username.includes('@')
  const user = await prisma.user.findUnique({ where: isEmail ? { email: username } : { username } })
  if (!user) return new Response(null, { status: 204 })

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return new Response(null, { status: 204 })

  await prisma.gameToken.deleteMany({ where: { userId: user.id } })
  return new Response(null, { status: 204 })
}
