// src/app/api/server/status/route.ts
import { NextResponse } from 'next/server'
import type { ServerStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { status } = await import('minecraft-server-util')
    const host = process.env.RCON_HOST ?? '127.0.0.1'
    const result = await status(host, 25565, { timeout: 5000, enableSRV: false })

    const data: ServerStatus = {
      online: true,
      players: {
        online: result.players.online,
        max: result.players.max,
      },
      version: result.version.name,
      motd: result.motd.clean,
    }
    return NextResponse.json(data)
  } catch {
    const offline: ServerStatus = {
      online: false,
      players: { online: 0, max: 100 },
      version: '',
    }
    return NextResponse.json(offline)
  }
}
