const SAFE_USERNAME = /^[a-zA-Z0-9_]{3,16}$/
const SAFE_ITEM = /^[a-z0-9_]+(:[a-z0-9_]+)?$/
const SAFE_TEXT = /^[\p{L}\p{N} _.,!?'"-]{1,120}$/u
const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'] as const

export type PlayerActionTier = 'safe' | 'confirm'

export interface PlayerActionDef {
  tier: PlayerActionTier
  label: string
  destructive?: boolean
}

// Registry drives both validation and the UI action bar.
export const PLAYER_ACTIONS: Record<string, PlayerActionDef> = {
  kick:      { tier: 'confirm', label: 'Кик', destructive: true },
  mute:      { tier: 'confirm', label: 'Мут', destructive: true },
  unmute:    { tier: 'confirm', label: 'Размут' },
  heal:      { tier: 'confirm', label: 'Хил' },
  feed:      { tier: 'confirm', label: 'Покормить' },
  god:       { tier: 'confirm', label: 'God-режим' },
  gamemode:  { tier: 'confirm', label: 'Режим игры' },
  give:      { tier: 'confirm', label: 'Выдать предмет' },
  tp_coords: { tier: 'confirm', label: 'Телепорт' },
  bring:     { tier: 'confirm', label: 'Призвать к себе' },
  kill:      { tier: 'confirm', label: 'Убить', destructive: true },
  broadcast: { tier: 'safe',    label: 'Объявление' },
}

interface Params {
  username?: string
  target?: string
  reason?: string
  message?: string
  time?: string
  item?: string
  amount?: number
  mode?: string
  x?: number
  y?: number
  z?: number
}

function user(name: string | undefined): string {
  if (!name || !SAFE_USERNAME.test(name)) throw new Error(`Unsafe username: ${name}`)
  return name
}
function text(s: string | undefined, field: string): string {
  if (s === undefined) throw new Error(`Missing ${field}`)
  if (!SAFE_TEXT.test(s)) throw new Error(`Unsafe ${field}`)
  return s
}
function intIn(n: number | undefined, lo: number, hi: number, field: string): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < lo || n > hi) throw new Error(`Bad ${field}`)
  return n
}
function num(n: number | undefined, field: string): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`Bad ${field}`)
  return n
}

// Builds a validated RCON command string for a player action. Throws on any
// failed guard — never interpolates raw input that has not passed a regex check.
export function buildPlayerCommand(action: string, p: Params): string {
  switch (action) {
    case 'kick':   return `kick ${user(p.username)} ${text(p.reason ?? 'Кик администратором', 'reason')}`
    case 'mute':   return `mute ${user(p.username)} ${text(p.time ?? '10m', 'time')} ${text(p.reason ?? 'Мут администратором', 'reason')}`
    case 'unmute': return `unmute ${user(p.username)}`
    case 'heal':   return `heal ${user(p.username)}`
    case 'feed':   return `feed ${user(p.username)}`
    case 'god':    return `god ${user(p.username)}`
    case 'kill':   return `kill ${user(p.username)}`
    case 'gamemode': {
      const m = p.mode ?? ''
      if (!(GAMEMODES as readonly string[]).includes(m)) throw new Error(`Bad gamemode: ${m}`)
      return `gamemode ${m} ${user(p.username)}`
    }
    case 'give': {
      if (!p.item || !SAFE_ITEM.test(p.item)) throw new Error(`Bad item: ${p.item}`)
      return `give ${user(p.username)} ${p.item} ${intIn(p.amount, 1, 6400, 'amount')}`
    }
    case 'tp_coords':
      return `tp ${user(p.username)} ${num(p.x, 'x')} ${num(p.y, 'y')} ${num(p.z, 'z')}`
    case 'bring':
      return `tp ${user(p.target)} ${user(p.username)}`
    case 'broadcast':
      return `broadcast ${text(p.message, 'message')}`
    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
