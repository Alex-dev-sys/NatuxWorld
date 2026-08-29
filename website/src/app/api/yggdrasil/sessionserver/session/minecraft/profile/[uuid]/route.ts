import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { offlineUuid, buildProfile } from '@/lib/yggdrasil'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { uuid: string } }) {
  const { uuid } = params

  // Find user whose offline UUID matches the requested UUID.
  // We can't query by computed value, so find all users and compare.
  // In practice this is rare (admin tools / skin fetch), so no perf concern.
  const users = await prisma.user.findMany({
    where: { emailVerified: true, bannedAt: null },
    select: { username: true },
  })
  const match = users.find((u) => offlineUuid(u.username) === uuid)
  if (!match) return new Response(null, { status: 204 })

  return Response.json(buildProfile(match.username))
}
