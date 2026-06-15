import jwt from 'jsonwebtoken'

// A short-lived token proving "password step passed; awaiting 2FA". Distinct
// `purpose` claim so it can never be used as a session token.
export function signChallenge(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.sign({ sub: userId, purpose: '2fa' }, secret, { expiresIn: '5m' })
}

export function verifyChallenge(token: string): string | null {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  try {
    const p = jwt.verify(token, secret) as { sub: string; purpose?: string }
    return p.purpose === '2fa' ? p.sub : null
  } catch { return null }
}
