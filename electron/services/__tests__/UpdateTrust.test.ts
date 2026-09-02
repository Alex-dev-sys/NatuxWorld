import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  isUpdateVisible,
  matchesUpdateCandidate,
  UPDATE_REPOSITORY,
  verifyUpdateManifest,
  type SignedUpdateManifest,
} from '../UpdateTrust';

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const manifest: SignedUpdateManifest = {
    schemaVersion: 1,
    repository: UPDATE_REPOSITORY,
    version: '1.10.0',
    artifact: 'NATUX WORLD-Setup-1.10.0-x64.exe',
    sha512: Buffer.alloc(64, 7).toString('base64'),
  };
  const raw = JSON.stringify(manifest);
  const signature = sign(null, Buffer.from(raw), privateKey).toString('base64');
  return { manifest, raw, signature, publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

describe('signed update trust', () => {
  it('accepts an authentic Ed25519 manifest', () => {
    const value = fixture();
    expect(verifyUpdateManifest(value.raw, value.signature, value.publicKey)).toEqual(value.manifest);
  });

  it('rejects a manifest changed after signing', () => {
    const value = fixture();
    const tampered = value.raw.replace('1.10.0', '1.10.1');
    expect(() => verifyUpdateManifest(tampered, value.signature, value.publicKey)).toThrow(
      'signature verification failed',
    );
  });

  it('matches the exact signed artifact and SHA-512', () => {
    const { manifest } = fixture();
    expect(matchesUpdateCandidate({
      version: manifest.version,
      files: [{
        url: `https://github.com/release/${encodeURIComponent(manifest.artifact)}`,
        sha512: manifest.sha512,
      }],
    }, manifest)).toBe(true);
    expect(matchesUpdateCandidate({
      version: manifest.version,
      files: [{ url: manifest.artifact, sha512: Buffer.alloc(64, 8).toString('base64') }],
    }, manifest)).toBe(false);
  });
});

describe('update visibility (channel + staged rollout)', () => {
  const base = { ...fixture().manifest, sha512: Buffer.alloc(64, 7).toString('base64') };
  const ctx = { channel: 'stable' as const, installId: 'aaaa-bbbb', currentVersion: '1.9.0' };

  it('hides same-version and older feeds', () => {
    expect(isUpdateVisible({ ...base, version: '1.9.0' }, ctx)).toBe(false);
  });

  it('shows stable releases to stable-channel installs', () => {
    expect(isUpdateVisible(base, ctx)).toBe(true);
  });

  it('never shows a beta-channel manifest to stable installs', () => {
    expect(isUpdateVisible({ ...base, channel: 'beta' }, ctx)).toBe(false);
  });

  it('shows beta manifests to beta-channel installs', () => {
    expect(isUpdateVisible({ ...base, channel: 'beta' }, { ...ctx, channel: 'beta' })).toBe(true);
  });

  it('rollout 0% hides, 100% shows', () => {
    expect(isUpdateVisible({ ...base, rolloutPct: 0 }, ctx)).toBe(false);
    expect(isUpdateVisible({ ...base, rolloutPct: 100 }, ctx)).toBe(true);
  });

  it('rollout bucketing is deterministic per install+version', () => {
    const a = isUpdateVisible({ ...base, rolloutPct: 50 }, ctx);
    const b = isUpdateVisible({ ...base, rolloutPct: 50 }, ctx);
    expect(a).toBe(b);
    // Across installs, some are in and some are out (not all-or-nothing).
    const results = new Set(
      Array.from({ length: 40 }, (_, i) =>
        isUpdateVisible({ ...base, rolloutPct: 50 }, { ...ctx, installId: `install-${i}` })),
    );
    expect(results.size).toBe(2);
  });
});
