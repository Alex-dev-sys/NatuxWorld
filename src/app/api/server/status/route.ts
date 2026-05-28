import { NextResponse } from 'next/server'
import type { ServerStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  // MOCK — replace with real Minecraft server ping:
  //
  // import { status } from 'minecraft-server-util'
  // const result = await status(process.env.RCON_HOST!, 25565)
  // return NextResponse.json({
  //   online: true,
  //   players: { online: result.players.online, max: result.players.max },
  //   version: result.version.name,
  //   motd: result.motd.clean,
  // })

  const mock: ServerStatus = {
    online: true,
    players: { online: Math.floor(Math.random() * 20) + 1, max: 100 },
    version: '1.20.4',
    motd: 'NATUX WORLD — No rules. No mercy.',
  }

  return NextResponse.json(mock)
}
