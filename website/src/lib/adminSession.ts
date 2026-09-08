// Edge-compatible signed session tokens (Web Crypto only — works in Node 20 and edge middleware)

export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

async function signExpiry(secret: string, exp: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await globalThis.crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(`admin-session-v1:${exp}`))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createSessionToken(secret: string, ttlSeconds: number): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds)
  // Random per-session id: a stolen cookie can be revoked server-side, unlike
  // the previous deterministic HMAC(exp) token whose only "revocation" was expiry.
  const sid = globalThis.crypto.randomUUID().replace(/-/g, '')
  const sigHex = await signExpiry(secret, `${exp}.${sid}`)
  return `${exp}.${sid}.${sigHex}`
}

/** Session id carried by a token, or null when the token is malformed. */
export function sessionIdOf(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  return /^[a-f0-9]{32}$/.test(parts[1]) ? parts[1] : null
}

/**
 * Signature + expiry only. This runs in edge middleware, which cannot reach the
 * database, so it is a coarse gate: whether the session is still live is decided
 * by requireAdmin() (Node runtime) against the AdminSession table.
 */
export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const exp: string | undefined = parts[0]
  const sid: string | undefined = parts[1]
  const sig: string | undefined = parts[2]
  if (exp === undefined || sid === undefined || sig === undefined) return false
  if (!/^\d+$/.test(exp) || !/^[a-f0-9]{32}$/.test(sid)) return false
  const expSeconds = parseInt(exp, 10)
  if (Number.isNaN(expSeconds) || expSeconds <= Math.floor(Date.now() / 1000)) return false
  const expected = await signExpiry(secret, `${exp}.${sid}`)
  // Constant-time string comparison via XOR
  if (sig.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
