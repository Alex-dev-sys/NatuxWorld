import jwt from 'jsonwebtoken'

// A short-lived token proving "password step passed; awaiting 2FA". Distinct
// `purpose` claim so it can never be used as a session token.
//
// It also pins the credential version it was issued against: a password change
// or a global sign-out bumps tokenVersion, and a challenge minted before that
// must not still be completable into a fresh session.
export function signChallenge(userId: string, tokenVersion: number): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.sign({ sub: userId, purpose: '2fa', tv: tokenVersion }, secret, { expiresIn: '5m' })
}

export function verifyChallenge(token: string): { userId: string; tokenVersion: number } | null {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  try {
    const p = jwt.verify(token, secret) as { sub?: string; purpose?: string; tv?: number }
    if (p.purpose !== '2fa' || typeof p.sub !== 'string' || typeof p.tv !== 'number') return null
    return { userId: p.sub, tokenVersion: p.tv }
  } catch { return null }
}
