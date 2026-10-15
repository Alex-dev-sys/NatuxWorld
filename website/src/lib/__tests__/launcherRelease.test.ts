import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyLauncherRelease } from '../launcherRelease'

function signed(overrides: Record<string, unknown> = {}) {
  const keys = generateKeyPairSync('ed25519')
  const raw = JSON.stringify({ schemaVersion: 1, repository: 'Alex-dev-sys/NatuxWorld', channel: 'stable',
    version: '1.9.16', rolloutPct: 100, migrationEnabled: true,
    feedUrl: 'https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v1.9.16/latest.json', ...overrides })
  return { raw, signature: sign(null, Buffer.from(raw), keys.privateKey).toString('base64'),
    publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
}

describe('website launcher release adoption', () => {
  it('uses signed versioned Tauri installers for each supported platform', () => {
    const value = signed()
    const release = verifyLauncherRelease(value.raw, value.signature, value.publicKey)!
    expect(release.runtime).toBe('tauri')
    expect(release.downloads['windows-x86_64']).toContain('/v1.9.16/NatuxWorld-1.9.16-x64-setup.exe')
    expect(release.downloads['darwin-aarch64']).toContain('NatuxWorld-1.9.16-aarch64.dmg')
  })
  it('keeps prior downloads until migration is explicitly accepted', () => {
    for (const overrides of [{ migrationEnabled: false }, { rolloutPct: 0 }]) {
      const value = signed(overrides)
      expect(verifyLauncherRelease(value.raw, value.signature, value.publicKey)).toBeNull()
    }
  })
  it('rejects tampering, beta versions, foreign feed URLs and malformed controls', () => {
    const value = signed()
    expect(() => verifyLauncherRelease(value.raw.replace('1.9.16', '1.9.17'), value.signature, value.publicKey)).toThrow('signature')
    for (const overrides of [{ version: '1.9.16-beta.1' }, { channel: 'beta' },
      { feedUrl: 'https://attacker.invalid/latest.json' }, { rolloutPct: 101 }, { repository: 'other/repo' }]) {
      const invalid = signed(overrides)
      expect(() => verifyLauncherRelease(invalid.raw, invalid.signature, invalid.publicKey)).toThrow('control')
    }
  })
})
