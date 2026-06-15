import { authenticator } from 'otplib'

// Allow ±1 time step (30s) to tolerate clock skew.
authenticator.options = { window: 1 }

export function generateTotpSecret(): string {
  return authenticator.generateSecret() // base32
}

export function verifyTotp(token: string, secret: string): boolean {
  try { return authenticator.verify({ token: token.trim(), secret }) } catch { return false }
}

export function otpauthUri(account: string, secret: string): string {
  return authenticator.keyuri(account, 'NATUX WORLD', secret)
}
