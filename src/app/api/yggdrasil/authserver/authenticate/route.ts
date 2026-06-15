import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { buildProfile, randomToken } from '@/lib/yggdrasil'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/clientIp'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials' }, { status: 403 }) }

  const { username, password, clientToken, requestUser } = body as Record<string, string>
  if (!username || !password) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials' }, { status: 403 })
  }

  const ip = clientIp(req)
  if (!rateLimit(`ygg-auth:${ip}:${username}`, 10, 60_000)) {
    return Response.json(
      { error: 'ForbiddenOperationException', errorMessage: 'Too many requests' },
      { status: 429 },
    )
  }

  const isEmail = username.includes('@')
  const user = await prisma.user.findUnique({
    where: isEmail ? { email: username } : { username },
  })
  if (!user || !user.emailVerified) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials' }, { status: 403 })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return Response.json({ error: 'ForbiddenOperationException', errorMessage: 'Invalid credentials' }, { status: 403 })
  }

  const accessToken = randomToken()
  const resolvedClientToken = clientToken ?? randomToken()

  await prisma.gameToken.create({
    data: { accessToken, clientToken: resolvedClientToken, userId: user.id },
  })

  const profile = buildProfile(user.username)
  const resp: Record<string, unknown> = {
    accessToken,
    clientToken: resolvedClientToken,
    availableProfiles: [profile],
    selectedProfile: profile,
  }
  if (requestUser) resp.user = { id: user.id, username: user.username }
  return Response.json(resp)
}
