// Parsers for RCON command output. Pure functions, unit-tested in
// __tests__/rconParsers.test.ts. Kept separate from rcon.ts (transport) so the
// parsing logic stays easy to test without touching the network layer.

// Strip Minecraft section-sign colour codes (§a, §6, …) from a string.
export function stripColorCodes(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, '')
}

export interface PlayerList {
  online: number
  max: number
  players: string[]
}

// Vanilla `list`: "There are 2 of a max of 20 players online: steve, alex"
export function parsePlayers(text: string): PlayerList {
  const m = stripColorCodes(text).match(/There are (\d+) of (?:a max of )?(\d+) players online:?\s*(.*)/i)
  if (!m) return { online: 0, max: 0, players: [] }
  const players = (m[3] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return { online: Number(m[1]), max: Number(m[2]), players }
}

// Paper `tps`: "TPS from last 1m, 5m, 15m: 20.0, 20.0, *19.5"
// Returns the up-to-three averages; '*' (capped) markers are ignored.
export function parseTps(text: string): number[] {
  const clean = stripColorCodes(text)
  const idx = clean.search(/:/)
  const tail = idx >= 0 ? clean.slice(idx + 1) : clean
  const nums = tail.match(/\d+(?:\.\d+)?/g)
  return nums ? nums.map(Number) : []
}

// Vanilla `whitelist list`: "There are 3 whitelisted player(s): a, b, c"
// or "There are no whitelisted players".
export function parseWhitelist(text: string): string[] {
  const clean = stripColorCodes(text)
  if (/no whitelisted player/i.test(clean)) return []
  const m = clean.match(/whitelisted player\(?s?\)?:?\s*(.*)/i)
  if (!m) return []
  return (m[1] ?? '').split(',').map(s => s.trim()).filter(Boolean)
}
