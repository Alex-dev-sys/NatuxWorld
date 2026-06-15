import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function generateAppPassword(): string {
  const groups = Array.from({ length: 4 }, () =>
    Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join(''),
  )
  return groups.join('-')
}

export async function hashAppPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

// Returns true if `plain` matches ANY of the user's stored hashes.
export async function verifyAppPassword(plain: string, hashes: string[]): Promise<boolean> {
  for (const h of hashes) {
    if (await bcrypt.compare(plain, h)) return true
  }
  return false
}
