export type RconTier = 'safe' | 'confirm' | 'server'

// Lifecycle commands that affect server availability.
const SERVER = /^(stop|restart|save-all|save-off|save-on)\b/
// Read-only or harmless broadcast commands that need no confirmation.
const SAFE = /^(list|tps|spark|version|seed|time\s+query|say|tell|msg|weather|whitelist\s+list|mcmmo)\b/

// Returns the tier for a raw RCON command. Unknown commands default to `confirm`
// (fail safe) rather than being silently blocked — the route is already behind
// admin auth + IP allowlist, so the confirm step is the real guardrail.
export function classifyRcon(command: string): RconTier {
  const c = command.trim().replace(/^\//, '').toLowerCase()
  if (SERVER.test(c)) return 'server'
  if (SAFE.test(c)) return 'safe'
  return 'confirm'
}
