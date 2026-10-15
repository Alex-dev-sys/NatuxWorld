import { verify } from 'node:crypto';

export const UPDATE_REPOSITORY = 'Alex-dev-sys/NatuxWorld';
export const UPDATE_MANIFEST_URL =
  'https://github.com/Alex-dev-sys/NatuxWorld/releases/latest/download/natux-update.json';
export const UPDATE_SIGNATURE_URL = `${UPDATE_MANIFEST_URL}.sig`;

export const UPDATE_SIGNING_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAOrUKMFQrBqWq9utev5Qb1bgJ2libkYuLZsnhPODwF8E=
-----END PUBLIC KEY-----`;

export interface SignedUpdateManifest {
  schemaVersion: 1;
  repository: typeof UPDATE_REPOSITORY;
  version: string;
  artifact: string;
  /** SHA-512 of the published INSTALLER (what electron-updater downloads). */
  sha512: string;
  /**
   * Optional SHA-512 of the INSTALLED executable (release/win-unpacked/*.exe).
   * A different file from the installer, so self-integrity must compare against
   * this — never against `sha512`. Absent on manifests from older releases.
   */
  executableSha512?: string;
  /** Optional release channel — absent means 'stable'. */
  channel?: 'stable' | 'beta';
  /** Optional staged-rollout percentage (0–100) — absent means 100. */
  rolloutPct?: number;
}

export interface UpdateCandidate {
  version: string;
  files: Array<{ url: string; sha512?: string }>;
}

export interface UpdateVisibilityOptions {
  /** Channel the user selected (default 'stable'). */
  channel: 'stable' | 'beta';
  /** Stable per-install id for rollout bucketing (never leaves the machine). */
  installId: string;
  /** Current launcher version. */
  currentVersion: string;
}

export interface SignedTauriControl {
  schemaVersion: 1;
  repository: typeof UPDATE_REPOSITORY;
  channel: 'stable' | 'beta';
  version: string;
  rolloutPct: number;
  feedUrl: string;
  migrationEnabled: boolean;
  executableHashes?: Partial<Record<'windows-x86_64' | 'darwin-x86_64' | 'darwin-aarch64', string>>;
}

export interface TauriMigrationContext {
  channel: 'stable' | 'beta';
  installId: string;
  currentVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

export interface TauriMigrationOffer {
  version: string;
  url: string;
}

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ARTIFACT_RE = /^[^/\\]{1,200}\.exe$/i;
const SHA512_RE = /^[A-Za-z0-9+/]{86}==$/;
const ED25519_SIGNATURE_RE = /^[A-Za-z0-9+/]{86}==$/;
const MAX_MANIFEST_BYTES = 16 * 1024;
const MAX_SIGNATURE_BYTES = 1024;
const MAX_TAURI_CONTROL_BYTES = 16 * 1024;
const CANONICAL_UUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function assertManifest(value: unknown): asserts value is SignedUpdateManifest {
  if (!value || typeof value !== 'object') throw new Error('Update manifest is not an object');
  const manifest = value as Record<string, unknown>;
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported update manifest version');
  if (manifest.repository !== UPDATE_REPOSITORY) throw new Error('Update repository mismatch');
  if (typeof manifest.version !== 'string' || !VERSION_RE.test(manifest.version)) {
    throw new Error('Invalid update version');
  }
  if (typeof manifest.artifact !== 'string' || !ARTIFACT_RE.test(manifest.artifact)) {
    throw new Error('Invalid update artifact');
  }
  if (typeof manifest.sha512 !== 'string' || !SHA512_RE.test(manifest.sha512)) {
    throw new Error('Invalid update SHA-512');
  }
  if (
    manifest.executableSha512 !== undefined &&
    (typeof manifest.executableSha512 !== 'string' || !SHA512_RE.test(manifest.executableSha512))
  ) {
    throw new Error('Invalid executable SHA-512');
  }
  if (manifest.channel !== undefined && manifest.channel !== 'stable' && manifest.channel !== 'beta') {
    throw new Error('Invalid update channel');
  }
  if (
    manifest.rolloutPct !== undefined &&
    (typeof manifest.rolloutPct !== 'number' || !Number.isInteger(manifest.rolloutPct) ||
      manifest.rolloutPct < 0 || manifest.rolloutPct > 100)
  ) {
    throw new Error('Invalid rollout percentage');
  }
}

/**
 * Decide whether a verified manifest should be shown/downloaded by this install:
 * same channel, newer version, and (for staged releases) inside the rollout
 * bucket. Deterministic per installId+version, so a client either gets the
 * staged release or not — with no flapping between checks.
 */
export function isUpdateVisible(
  manifest: SignedUpdateManifest,
  opts: UpdateVisibilityOptions,
): boolean {
  if (manifest.version === opts.currentVersion) return false;
  const channel = manifest.channel ?? 'stable';
  if (channel !== opts.channel) return false;
  const rollout = manifest.rolloutPct ?? 100;
  if (rollout >= 100) return true;
  if (rollout <= 0 || !opts.installId) return false;
  // FNV-1a over installId + ':' + version → stable 0..99 bucket.
  const key = `${opts.installId}:${manifest.version}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100 < rollout;
}

export function verifyUpdateManifest(
  rawManifest: string,
  rawSignature: string,
  publicKey = UPDATE_SIGNING_PUBLIC_KEY,
): SignedUpdateManifest {
  if (Buffer.byteLength(rawManifest, 'utf8') > MAX_MANIFEST_BYTES) {
    throw new Error('Update manifest is too large');
  }
  const signature = rawSignature.trim();
  if (Buffer.byteLength(signature, 'utf8') > MAX_SIGNATURE_BYTES || !ED25519_SIGNATURE_RE.test(signature)) {
    throw new Error('Invalid update signature encoding');
  }
  const valid = verify(null, Buffer.from(rawManifest, 'utf8'), publicKey, Buffer.from(signature, 'base64'));
  if (!valid) throw new Error('Update manifest signature verification failed');

  const parsed: unknown = JSON.parse(rawManifest);
  assertManifest(parsed);
  return parsed;
}

function parseTauriControl(value: unknown): SignedTauriControl {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tauri update control is not an object');
  }
  const control = value as Record<string, unknown>;
  const allowed = new Set(['schemaVersion', 'repository', 'channel', 'version', 'rolloutPct', 'feedUrl', 'migrationEnabled', 'executableHashes']);
  if (Object.keys(control).some((key) => !allowed.has(key))) throw new Error('Unknown Tauri control field');
  if (control.executableHashes !== undefined) {
    const hashes = control.executableHashes;
    const platforms = new Set(['windows-x86_64', 'darwin-x86_64', 'darwin-aarch64']);
    if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)
      || Object.entries(hashes).some(([platform, hash]) => !platforms.has(platform)
        || typeof hash !== 'string' || !/^[0-9a-f]{128}$/.test(hash))) {
      throw new Error('Invalid Tauri executable hashes');
    }
  }
  if (control.schemaVersion !== 1 || control.repository !== UPDATE_REPOSITORY) {
    throw new Error('Tauri update control repository or schema mismatch');
  }
  if (control.channel !== 'stable' && control.channel !== 'beta') throw new Error('Invalid Tauri update channel');
  if (typeof control.version !== 'string' || !VERSION_RE.test(control.version)) throw new Error('Invalid Tauri update version');
  if (typeof control.rolloutPct !== 'number' || !Number.isInteger(control.rolloutPct) || control.rolloutPct < 0 || control.rolloutPct > 100) {
    throw new Error('Invalid Tauri update rollout');
  }
  if (control.feedUrl !== `https://github.com/${UPDATE_REPOSITORY}/releases/download/v${control.version}/latest.json`) {
    throw new Error('Tauri update feed URL does not match its version');
  }
  if (control.migrationEnabled !== undefined && typeof control.migrationEnabled !== 'boolean') {
    throw new Error('Invalid Tauri migration flag');
  }
  return {
    schemaVersion: 1,
    repository: UPDATE_REPOSITORY,
    channel: control.channel,
    version: control.version,
    rolloutPct: control.rolloutPct,
    feedUrl: control.feedUrl,
    migrationEnabled: control.migrationEnabled === true,
    ...(control.executableHashes !== undefined
      ? { executableHashes: control.executableHashes as SignedTauriControl['executableHashes'] }
      : {}),
  };
}

export function verifyTauriControl(
  rawControl: string,
  rawSignature: string,
  publicKey = UPDATE_SIGNING_PUBLIC_KEY,
): SignedTauriControl {
  if (Buffer.byteLength(rawControl, 'utf8') > MAX_TAURI_CONTROL_BYTES) throw new Error('Tauri control is too large');
  const signature = rawSignature.trim();
  if (Buffer.byteLength(signature, 'utf8') > MAX_SIGNATURE_BYTES || !ED25519_SIGNATURE_RE.test(signature)) {
    throw new Error('Invalid Tauri control signature encoding');
  }
  if (!verify(null, Buffer.from(rawControl, 'utf8'), publicKey, Buffer.from(signature, 'base64'))) {
    throw new Error('Tauri control signature verification failed');
  }
  return parseTauriControl(JSON.parse(rawControl) as unknown);
}

function compareSemver(left: string, right: string): number | null {
  const parse = (version: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
    return match ? { core: match.slice(1, 4), pre: match[4]?.split('.') ?? null } : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  const numeric = (x: string, y: string) => x.length === y.length ? (x === y ? 0 : x < y ? -1 : 1) : x.length < y.length ? -1 : 1;
  for (let i = 0; i < 3; i++) {
    const order = numeric(a.core[i], b.core[i]);
    if (order) return order;
  }
  if (a.pre === null || b.pre === null) return a.pre === b.pre ? 0 : a.pre === null ? 1 : -1;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === y) continue;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) return numeric(x, y);
    if (xNum !== yNum) return xNum ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return a.pre.length === b.pre.length ? 0 : a.pre.length < b.pre.length ? -1 : 1;
}

function visibleToTauriRollout(control: SignedTauriControl, installId: string): boolean {
  if (control.rolloutPct >= 100) return true;
  // Rust requires Uuid::parse_str before hashing staged Tauri rollouts.
  if (control.rolloutPct <= 0 || !CANONICAL_UUID_RE.test(installId)) return false;
  const key = `${installId}:${control.version}`;
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(key, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100 < control.rolloutPct;
}

export function getTauriMigrationOffer(
  control: SignedTauriControl,
  context: TauriMigrationContext,
): TauriMigrationOffer | null {
  if (!control.migrationEnabled || control.channel !== context.channel || !visibleToTauriRollout(control, context.installId)) {
    return null;
  }
  const order = compareSemver(control.version, context.currentVersion);
  if (order === null || order < 0) return null;

  let asset: string;
  if (context.platform === 'win32' && context.arch === 'x64') asset = `NatuxWorld-${control.version}-x64-setup.exe`;
  else if (context.platform === 'darwin' && context.arch === 'arm64') asset = `NatuxWorld-${control.version}-aarch64.dmg`;
  else if (context.platform === 'darwin' && context.arch === 'x64') asset = `NatuxWorld-${control.version}-x86_64.dmg`;
  else return null;

  return {
    version: control.version,
    url: `https://github.com/${UPDATE_REPOSITORY}/releases/download/v${control.version}/${asset}`,
  };
}

function artifactName(url: string): string | null {
  try {
    const pathname = new URL(url, 'https://updates.invalid').pathname;
    const encoded = pathname.split('/').pop();
    return encoded ? decodeURIComponent(encoded) : null;
  } catch {
    return null;
  }
}

export function matchesUpdateCandidate(
  candidate: UpdateCandidate,
  manifest: SignedUpdateManifest,
): boolean {
  if (
    !candidate || typeof candidate !== 'object' || candidate.version !== manifest.version ||
    !Array.isArray(candidate.files) ||
    candidate.files.some((file) => !file || typeof file !== 'object' || typeof file.url !== 'string')
  ) return false;
  // electron-updater selects an .exe by architecture substring, not by this
  // signed name. Any second executable could be selected first, even if its
  // filename does not end in the conventional "-x64.exe" form.
  const executables = candidate.files.filter((file) => artifactName(file.url)?.toLowerCase().endsWith('.exe'));
  if (executables.length !== 1) return false;
  const selected = executables[0];
  return artifactName(selected.url)?.toLowerCase() === manifest.artifact.toLowerCase() &&
    selected.sha512 === manifest.sha512;
}

async function fetchSmallText(url: string, maxBytes: number): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: 'application/octet-stream' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Update trust file returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) throw new Error('Update trust file is too large');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('Update trust file is too large');
  return text;
}

export async function fetchTrustedUpdateManifest(): Promise<SignedUpdateManifest> {
  const [manifest, signature] = await Promise.all([
    fetchSmallText(UPDATE_MANIFEST_URL, MAX_MANIFEST_BYTES),
    fetchSmallText(UPDATE_SIGNATURE_URL, MAX_SIGNATURE_BYTES),
  ]);
  return verifyUpdateManifest(manifest, signature);
}

async function fetchTrustedTauriText(url: string, maxBytes: number): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: 'application/octet-stream' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Tauri update control returned HTTP ${response.status}`);
  const finalUrl = new URL(response.url);
  const trustedHost = finalUrl.hostname === 'github.com' || finalUrl.hostname.endsWith('.githubusercontent.com');
  if (finalUrl.protocol !== 'https:' || !trustedHost) throw new Error('Tauri update control redirected to an untrusted host');
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) throw new Error('Tauri update control is too large');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('Tauri update control is too large');
  return text;
}

export async function fetchTrustedTauriControl(channel: 'stable' | 'beta'): Promise<SignedTauriControl> {
  const base = `https://github.com/${UPDATE_REPOSITORY}/releases/download/tauri-${channel}-feed/natux-tauri-control.json`;
  const [control, signature] = await Promise.all([
    fetchTrustedTauriText(base, MAX_TAURI_CONTROL_BYTES),
    fetchTrustedTauriText(`${base}.sig`, MAX_SIGNATURE_BYTES),
  ]);
  return verifyTauriControl(control, signature);
}
