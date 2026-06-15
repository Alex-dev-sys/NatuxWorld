import { randomBytes, createHash } from 'node:crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

function chunk(): string {
  const bytes = randomBytes(4)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function generateBackupCodes(count = 10): string[] {
  const set = new Set<string>()
  while (set.size < count) set.add(`${chunk()}-${chunk()}`)
  return [...set]
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex')
}
