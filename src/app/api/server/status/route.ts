// src/app/api/server/status/route.ts
import { NextResponse } from 'next/server'
import type { ServerStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

async function fetchTps(): Promise<number | null> {
  try {
    const { Rcon } = await import('rcon-client')
    const rcon = new Rcon({
      host: process.env.RCON_HOST ?? '127.0.0.1',
      port: Number(process.env.RCON_PORT ?? 25575),
      password: process.env.RCON_PASSWORD ?? '',
      timeout: 3000,
    })
    await rcon.connect()
    const response = await rcon.send('tps')
    await rcon.end()
    const match = response.match(/(\d+\.\d+)/)
    return match ? parseFloat(match[1]) : null
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const { status } = await import('minecraft-server-util')
    const host = process.env.RCON_HOST ?? '127.0.0.1'
    const [result, tps] = await Promise.all([
      status(host, 25565, { timeout: 5000, enableSRV: false }),
      fetchTps(),
    ])

    const data: ServerStatus = {
      online: true,
      players: {
        online: result.players.online,
        max: result.players.max,
      },
      version: result.version.name,
      motd: result.motd.clean,
      tps: tps ?? undefined,
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
