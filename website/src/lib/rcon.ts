// src/lib/rcon.ts
import type { Duration } from './types'

export interface RconResult {
  success: boolean
  commands: string[]
  responses?: string[]
  error?: string
}

const DURATION_DAYS: Record<Duration, string> = {
  '30d': '30',
  '90d': '90',
  forever: '∞',
}

const SAFE_USERNAME = /^[a-zA-Z0-9_]{3,16}$/
const SAFE_ALPHANUMERIC = /^[a-zA-Z0-9_\-. ]+$/

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
  if (!SAFE_USERNAME.test(vars.username)) throw new Error(`Unsafe username: ${vars.username}`)
  if (!SAFE_ALPHANUMERIC.test(vars.rank)) throw new Error(`Unsafe rank: ${vars.rank}`)
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

// Canned responses for mock mode, keyed by command — keeps dev/CI realistic
// enough to exercise the parsers without a live server.
function mockRconResponse(cmd: string): string {
  if (/^\/?list\b/i.test(cmd)) return 'There are 2 of 20 players online: steve, alex'
  if (/^\/?tps\b/i.test(cmd)) return 'TPS from last 1m, 5m, 15m: 20.0, 19.9, 19.8'
  if (/^\/?whitelist\s+list\b/i.test(cmd)) return 'There are 3 whitelisted player(s): steve, alex, notch'
  return 'OK'
}

// `progress` accumulates every command that received a successful response,
// across attempts — executeRcon uses it as a checkpoint so a mid-list failure
// never re-runs commands that already executed server-side.
async function tryRcon(
  commands: string[],
  progress: { commands: string[]; responses: string[] }
): Promise<RconResult> {
  if (process.env.RCON_MOCK === 'true') {
    console.log('[MOCK RCON] Commands:', commands)
    if (process.env.RCON_MOCK_FAIL === 'true') {
      return { success: false, commands, error: 'Connection refused (mock fail mode)' }
    }
    await new Promise(r => setTimeout(r, 200))
    const responses = commands.map(c => mockRconResponse(c.trim()))
    progress.commands.push(...commands)
    progress.responses.push(...responses)
    return { success: true, commands: [...progress.commands], responses: [...progress.responses] }
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
      progress.commands.push(cmd)
      progress.responses.push(response)
    }
    return { success: true, commands: [...progress.commands], responses: [...progress.responses] }
  } finally {
    await rcon.end()
  }
}

export async function executeRcon(commands: string[]): Promise<RconResult> {
  const MAX_ATTEMPTS = 3
  let lastError = ''
  const progress: { commands: string[]; responses: string[] } = { commands: [], responses: [] }
  // Only commands without a recorded successful response are ever retried.
  let remaining = commands

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && remaining.length > 0; attempt++) {
    try {
      return await tryRcon(remaining, progress)
    } catch (err) {
      lastError = String(err)
      console.error(`[RCON] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`)
      remaining = commands.filter(c => !progress.commands.includes(c))
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, attempt * 2000))
      }
    }
  }

  return { success: false, commands: [...progress.commands], error: lastError }
}

export { DURATION_DAYS }
