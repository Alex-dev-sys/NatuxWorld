import { createHash, createPrivateKey, createPublicKey, randomBytes } from 'crypto'

// Same algorithm as electron/services/AuthService.ts — keeps UUIDs stable across online/offline modes.
export function offlineUuid(username: string): string {
  const hash = createHash('md5').update('OfflinePlayer:' + username).digest()
  hash[6] = (hash[6] & 0x0f) | 0x30 // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80 // IETF variant
  return hash.toString('hex')         // unhyphenated for Yggdrasil
}

export function buildProfile(username: string) {
  return { id: offlineUuid(username), name: username, properties: [] }
}

export function randomToken(): string {
  return randomBytes(16).toString('hex')
}

export function getPublicKeyPem(): string {
  const raw = process.env.YGGDRASIL_PRIVATE_KEY
  if (!raw) throw new Error('YGGDRASIL_PRIVATE_KEY not set')
  const pem = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
  return createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'pem' }) as string
}
