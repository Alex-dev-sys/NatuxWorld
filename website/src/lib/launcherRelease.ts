import { verify } from 'node:crypto'

const REPOSITORY = 'Alex-dev-sys/NatuxWorld'
const BASE = `https://github.com/${REPOSITORY}/releases/download`
const CONTROL = `${BASE}/tauri-stable-feed/natux-tauri-control.json`
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAOrUKMFQrBqWq9utev5Qb1bgJ2libkYuLZsnhPODwF8E=
-----END PUBLIC KEY-----`

export type LauncherPlatform = 'windows-x86_64' | 'darwin-x86_64' | 'darwin-aarch64'
export interface LauncherRelease {
  version: string
  runtime: 'tauri' | 'electron'
  downloads: Record<LauncherPlatform, string>
}

// Retain the last published installers until the signed control explicitly
// accepts the migration. Do not hand users links to unpublished artifacts.
const LEGACY_RELEASE: LauncherRelease = {
  version: '1.9.15', runtime: 'electron',
  downloads: {
    'windows-x86_64': `${BASE}/v1.9.15/NATUX-WORLD-Setup-1.9.15-x64.exe`,
    'darwin-x86_64': `${BASE}/v1.9.15/NATUX-WORLD-1.9.15-x64.dmg`,
    'darwin-aarch64': `${BASE}/v1.9.15/NATUX-WORLD-1.9.15-arm64.dmg`,
  },
}

export function verifyLauncherRelease(raw: string, signature: string, publicKey = PUBLIC_KEY): LauncherRelease | null {
  if (Buffer.byteLength(raw) > 16 * 1024 || !/^[A-Za-z0-9+/]{86}==$/.test(signature.trim())
    || !verify(null, Buffer.from(raw), publicKey, Buffer.from(signature.trim(), 'base64'))) {
    throw new Error('Invalid launcher release signature')
  }
  const control = JSON.parse(raw) as Record<string, unknown>
  if (!control || typeof control !== 'object' || Array.isArray(control)
    || control.schemaVersion !== 1 || control.repository !== REPOSITORY || control.channel !== 'stable'
    || typeof control.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(control.version)
    || !Number.isInteger(control.rolloutPct) || Number(control.rolloutPct) < 0 || Number(control.rolloutPct) > 100
    || control.feedUrl !== `${BASE}/v${control.version}/latest.json`
    || typeof control.migrationEnabled !== 'boolean') throw new Error('Invalid launcher release control')
  if (!control.migrationEnabled || control.rolloutPct === 0) return null
  const version = control.version
  const release = `${BASE}/v${version}`
  return { version, runtime: 'tauri', downloads: {
    'windows-x86_64': `${release}/NatuxWorld-${version}-x64-setup.exe`,
    'darwin-x86_64': `${release}/NatuxWorld-${version}-x86_64.dmg`,
    'darwin-aarch64': `${release}/NatuxWorld-${version}-aarch64.dmg`,
  } }
}

function trustedMetadataUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !(url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com'))) {
    throw new Error('Untrusted launcher metadata host')
  }
  return url
}

async function metadataText(value: string, maximum: number, signal: AbortSignal): Promise<string> {
  let url = trustedMetadataUrl(value)
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await fetch(url, { signal, redirect: 'manual', cache: 'no-store' })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error('Missing launcher metadata redirect')
      url = trustedMetadataUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Launcher release metadata unavailable') }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        if (size > maximum) throw new Error('Launcher release metadata too large')
        chunks.push(next.value)
      }
      return Buffer.concat(chunks).toString('utf8')
    } finally { await reader.cancel(); reader.releaseLock() }
  }
  throw new Error('Too many launcher metadata redirects')
}

let cache: { expiresAt: number; release: LauncherRelease } | undefined
let inflight: Promise<LauncherRelease> | undefined

export function getLauncherRelease(): Promise<LauncherRelease> {
  if (cache && cache.expiresAt > Date.now()) return Promise.resolve(cache.release)
  if (inflight) return inflight
  inflight = (async () => {
    let release = LEGACY_RELEASE
    try {
      const signal = AbortSignal.timeout(6000)
      const [raw, signature] = await Promise.all([
        metadataText(CONTROL, 16 * 1024, signal), metadataText(`${CONTROL}.sig`, 1024, signal),
      ])
      release = verifyLauncherRelease(raw, signature) ?? LEGACY_RELEASE
    } catch { /* Keep working downloads during rollout or a temporary feed outage. */ }
    cache = { expiresAt: Date.now() + 60_000, release }
    return release
  })().finally(() => { inflight = undefined })
  return inflight
}
