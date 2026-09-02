import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { buildProfile } from '@/lib/yggdrasil'

export const dynamic = 'force-dynamic'

// offlineUuid() returns unhyphenated 32-char hex (Yggdrasil offline style).
const UUID_RE = /^[0-9a-f]{32}$/

export async function GET(_req: NextRequest, { params }: { params: { uuid: string } }) {
  const { uuid } = params
  if (!UUID_RE.test(uuid)) return new Response(null, { status: 204 })

  // O(1) lookup via the precomputed uuid column (backfilled by migration).
  const user = await prisma.user.findUnique({
    where: { uuid },
    select: { username: true, emailVerified: true, bannedAt: true },
  })
  if (!user || !user.emailVerified || user.bannedAt) return new Response(null, { status: 204 })

  return Response.json(buildProfile(user.username))
}
