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
  sha512: string;
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

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ARTIFACT_RE = /^[^/\\]{1,200}\.exe$/i;
const SHA512_RE = /^[A-Za-z0-9+/]{86}==$/;
const ED25519_SIGNATURE_RE = /^[A-Za-z0-9+/]{86}==$/;
const MAX_MANIFEST_BYTES = 16 * 1024;
const MAX_SIGNATURE_BYTES = 1024;

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
  if (candidate.version !== manifest.version || !Array.isArray(candidate.files)) return false;
  return candidate.files.some(
    (file) => artifactName(file.url) === manifest.artifact && file.sha512 === manifest.sha512,
  );
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
