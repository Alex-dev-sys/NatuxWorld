// src/lib/rcon.ts
import type { Duration } from './types'

export interface RconResult {
  success: boolean
  commands: string[]
  error?: string
}

const DURATION_DAYS: Record<Duration, string> = {
  '30d': '30',
  '90d': '90',
  forever: '∞',
}

export function buildCommands(
  templates: string[],
  vars: {
    username: string
    rank: string
    duration: string
    durationDays: string
    orderId: string
    price: number
  }
): string[] {
  return templates.map(cmd =>
    cmd
      .replace(/{username}/g, vars.username)
      .replace(/{rank}/g, vars.rank)
      .replace(/{duration}/g, vars.duration)
      .replace(/{duration_days}/g, vars.durationDays)
      .replace(/{order_id}/g, vars.orderId)
      .replace(/{price}/g, String(vars.price))
  )
}

async function tryRcon(commands: string[]): Promise<RconResult> {
  if (process.env.PAYMENT_PROVIDER === 'mock' || process.env.RCON_MOCK === 'true') {
    console.log('[MOCK RCON] Commands:', commands)
    if (process.env.RCON_MOCK_FAIL === 'true') {
      return { success: false, commands, error: 'Connection refused (mock fail mode)' }
    }
    await new Promise(r => setTimeout(r, 200))
    return { success: true, commands }
  }

  const { Rcon } = await import('rcon-client')
  const rcon = new Rcon({
    host: process.env.RCON_HOST ?? '127.0.0.1',
    port: Number(process.env.RCON_PORT ?? 25575),
    password: process.env.RCON_PASSWORD ?? '',
    timeout: 5000,
  })

  await rcon.connect()
  try {
    for (const cmd of commands) {
      const response = await rcon.send(cmd)
      console.log(`[RCON] ${cmd} → ${response}`)
    }
    return { success: true, commands }
  } finally {
    await rcon.end()
  }
}

export async function executeRcon(commands: string[]): Promise<RconResult> {
  const MAX_ATTEMPTS = 3
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await tryRcon(commands)
    } catch (err) {
      lastError = String(err)
      console.error(`[RCON] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`)
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, attempt * 2000))
      }
    }
  }

  return { success: false, commands, error: lastError }
}

export { DURATION_DAYS }
