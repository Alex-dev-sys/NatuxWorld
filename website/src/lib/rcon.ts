// src/lib/rcon.ts
import type { Duration } from './types'

export interface RconResult {
  success: boolean
  /** Cumulative list of commands with a confirmed successful response. */
  commands: string[]
  responses?: string[]
  error?: string
  /**
   * The command that was in flight when the connection broke. It may or may not
   * have taken effect server-side, so it is deliberately NOT counted as done —
   * re-running it is an explicit admin decision, not an automatic one.
   */
  unknownCommand?: string
}

const DURATION_DAYS: Record<Duration, string> = {
  '30d': '30',
  '90d': '90',
  forever: '∞',
}

const SAFE_USERNAME = /^[a-zA-Z0-9_]{3,16}$/
const SAFE_ALPHANUMERIC = /^[a-zA-Z0-9_\-. ]+$/
const RCON_ERROR_RESPONSE = /\b(?:unknown|incomplete|error|failed|failure|denied|no permission|ошибк|неизвестн|недостаточн)\b/i

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

/**
 * Why an attempt stopped. The distinction decides whether the remainder may be
 * re-sent automatically: a command whose reply was lost may already have taken
 * effect server-side, so replaying it would grant the purchase twice.
 */
class RconAttemptError extends Error {
  constructor(
    message: string,
    /** Nothing was written to the server, so re-sending is safe. */
    readonly retryable: boolean,
    /** Set when a command was sent but its reply never arrived. */
    readonly unknownCommand?: string,
  ) {
    super(message)
  }
}

// `progress` accumulates every command that received a successful response,
// across attempts — executeRcon uses it as a checkpoint so a mid-list failure
// never re-runs commands that already executed server-side.
async function tryRcon(
  commands: string[],
  progress: { commands: string[]; responses: string[] },
  beforeCommand: () => Promise<void>,
): Promise<RconResult> {
  if (process.env.RCON_MOCK === 'true') {
    console.log('[MOCK RCON] Commands:', commands)
    if (process.env.RCON_MOCK_FAIL === 'true') {
      // Nothing ran, so nothing may be recorded as progress — returning a
      // "result" here previously persisted the UNSENT commands as executed, and
      // the next retry then marked the order delivered. Not retryable: the mock
      // fails deterministically, so backing off twice only wastes six seconds.
      throw new RconAttemptError('Connection refused (mock fail mode)', false)
    }
    await new Promise(r => setTimeout(r, 200))
    for (const cmd of commands) {
      await beforeCommand()
      progress.commands.push(cmd)
      progress.responses.push(mockRconResponse(cmd.trim()))
    }
    return { success: true, commands: [...progress.commands], responses: [...progress.responses] }
  }

  const { Rcon } = await import('rcon-client')
  const rcon = new Rcon({
    host: process.env.RCON_HOST ?? '127.0.0.1',
    port: Number(process.env.RCON_PORT ?? 25575),
    password: process.env.RCON_PASSWORD ?? '',
    timeout: 5000,
  })

  try {
    await rcon.connect()
  } catch (err) {
    // Never reached the server — the whole remainder is safe to retry.
    throw new RconAttemptError(`RCON connect failed: ${String(err)}`, true)
  }

  try {
    for (const cmd of commands) {
      await beforeCommand()
      let response: string
      try {
        response = await rcon.send(cmd)
      } catch (err) {
        // The command went out but no reply came back. It may already have
        // applied, so it must NOT be resent automatically — that is exactly how
        // one purchase turned into three.
        throw new RconAttemptError(`RCON response lost for "${cmd}": ${String(err)}`, false, cmd)
      }
      console.log(`[RCON] ${cmd} → ${response}`)
      if (RCON_ERROR_RESPONSE.test(response)) {
        // The server answered and refused: it did not apply, and resending would
        // be refused identically. Stop rather than burn attempts.
        throw new RconAttemptError(`RCON command rejected: ${response}`, false)
      }
      progress.commands.push(cmd)
      progress.responses.push(response)
    }
    return { success: true, commands: [...progress.commands], responses: [...progress.responses] }
  } finally {
    await rcon.end().catch(() => undefined)
  }
}

/**
 * `alreadyDone` is the number of leading commands confirmed executed by an
 * EARLIER call (persisted on the order). They are never sent again, so a retry
 * after a mid-list failure cannot re-apply a grant that already took effect.
 * The returned `commands` stays cumulative, covering both calls.
 */
export async function executeRcon(
  commands: string[],
  alreadyDone = 0,
  canSend?: () => Promise<boolean>,
): Promise<RconResult> {
  const beforeCommand = async () => {
    if (!canSend) return
    let allowed = false
    try { allowed = await canSend() } catch { /* ownership could not be proven */ }
    if (!allowed) throw new RconAttemptError('Delivery lease lost; remaining commands cancelled', false)
  }
  const MAX_ATTEMPTS = 3
  let lastError = ''
  const resumeFrom = Math.min(Math.max(alreadyDone, 0), commands.length)
  const progress: { commands: string[]; responses: string[] } = {
    commands: commands.slice(0, resumeFrom),
    // Keep responses index-aligned with commands for diagnostics.
    responses: commands.slice(0, resumeFrom).map(() => '(выполнено ранее)'),
  }
  // Only commands without a recorded successful response are ever retried.
  let completedCount = resumeFrom

  if (completedCount >= commands.length) {
    return { success: true, commands: [...progress.commands], responses: [] }
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && completedCount < commands.length; attempt++) {
    try {
      await beforeCommand()
      return await tryRcon(commands.slice(completedCount), progress, beforeCommand)
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`[RCON] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`)
      completedCount = progress.commands.length

      // Only a failure that provably sent nothing may be retried. Anything else
      // (a lost reply, an outright rejection, or an unexpected error we cannot
      // classify) stops here — re-sending could apply a grant a second time.
      const retryable = err instanceof RconAttemptError && err.retryable
      if (!retryable) {
        return {
          success: false,
          commands: [...progress.commands],
          responses: [...progress.responses],
          error: lastError,
          unknownCommand: err instanceof RconAttemptError
            ? err.unknownCommand
            : commands[completedCount],
        }
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, attempt * 2000))
      }
    }
  }

  // Exhausted retries without ever reaching the server: nothing was applied.
  return {
    success: false,
    commands: [...progress.commands],
    responses: [...progress.responses],
    error: lastError,
  }
}

export { DURATION_DAYS }
