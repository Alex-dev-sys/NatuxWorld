import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return new Response(null, { status: 204 }) }

  if (typeof body !== 'object' || body === null) return new Response(null, { status: 204 })
  const { username, password } = body as Record<string, unknown>
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return new Response(null, { status: 204 })
  }

  const isEmail = username.includes('@')
  // Email lookup is case-insensitive, matching /login — casing must not decide
  // whether a sign-out finds the account.
  const user = isEmail
    ? await prisma.user.findFirst({ where: { email: { equals: username.trim(), mode: 'insensitive' } } })
    : await prisma.user.findUnique({ where: { username: username.trim() } })
  if (!user) return new Response(null, { status: 204 })

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return new Response(null, { status: 204 })

  await prisma.gameToken.deleteMany({ where: { userId: user.id } })
  return new Response(null, { status: 204 })
}
