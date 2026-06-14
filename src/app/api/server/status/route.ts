// src/app/api/server/status/route.ts
import { NextResponse } from 'next/server'
import type { ServerStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const TTL_MS = 10_000

interface CacheEntry {
  data: ServerStatus
  fetchedAt: number
}

let cache: CacheEntry | null = null
let inflight: Promise<ServerStatus> | null = null

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

async function fetchStatus(): Promise<ServerStatus> {
  try {
    const { status } = await import('minecraft-server-util')
    const host = process.env.RCON_HOST ?? '127.0.0.1'
    const [result, tps] = await Promise.all([
      status(host, 25565, { timeout: 5000, enableSRV: false }),
      fetchTps(),
    ])

    return {
      online: true,
      players: {
        online: result.players.online,
        max: result.players.max,
      },
      version: result.version.name,
      motd: result.motd.clean,
      tps: tps ?? undefined,
    }
  } catch {
    return {
      online: false,
      players: { online: 0, max: 100 },
      version: '',
    }
  }
}

async function getStatus(): Promise<ServerStatus> {
  const now = Date.now()

  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.data
  }

  if (inflight) {
    return inflight
  }

  inflight = (async () => {
    try {
      const data = await fetchStatus()
      // Cache offline payloads too, so a down server isn't hammered
      cache = { data, fetchedAt: Date.now() }
      return data
    } finally {
      inflight = null
    }
  })()

  return inflight
}

export async function GET() {
  const data = await getStatus()
  return NextResponse.json(data)
}
