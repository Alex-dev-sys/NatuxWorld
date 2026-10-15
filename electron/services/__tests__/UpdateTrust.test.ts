import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  getTauriMigrationOffer,
  isUpdateVisible,
  matchesUpdateCandidate,
  UPDATE_REPOSITORY,
  verifyTauriControl,
  verifyUpdateManifest,
  type SignedTauriControl,
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

function tauriControlFixture(overrides: Partial<SignedTauriControl> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const control: SignedTauriControl = {
    schemaVersion: 1,
    repository: UPDATE_REPOSITORY,
    channel: 'stable',
    version: '1.9.15',
    rolloutPct: 100,
    feedUrl: `https://github.com/${UPDATE_REPOSITORY}/releases/download/v1.9.15/latest.json`,
    migrationEnabled: true,
    ...overrides,
  };
  const raw = JSON.stringify(control);
  const signature = sign(null, Buffer.from(raw), privateKey).toString('base64');
  return { control, raw, signature, publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
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

  it('rejects any additional executable the updater could select first', () => {
    const { manifest } = fixture();
    expect(matchesUpdateCandidate({
      version: manifest.version,
      files: [
        { url: 'payload-x64-custom.exe', sha512: Buffer.alloc(64, 8).toString('base64') },
        { url: manifest.artifact, sha512: manifest.sha512 },
      ],
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

describe('signed Electron-to-Tauri migration control', () => {
  it('preserves signed native executable hashes and rejects unexpected platforms or malformed hashes', () => {
    const fixtureValue = tauriControlFixture({ executableHashes: { 'windows-x86_64': 'a'.repeat(128) } });
    expect(verifyTauriControl(fixtureValue.raw, fixtureValue.signature, fixtureValue.publicKey))
      .toEqual(fixtureValue.control);
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    for (const hashes of [{ 'windows-x86_64': 'bad' }, { unknown: 'a'.repeat(128) }, []]) {
      const raw = JSON.stringify({ ...fixtureValue.control, executableHashes: hashes });
      const signature = sign(null, Buffer.from(raw), privateKey).toString('base64');
      expect(() => verifyTauriControl(raw, signature, publicKey.export({ type: 'spki', format: 'pem' }).toString()))
        .toThrow('executable hashes');
    }
  });
  const context = {
    channel: 'stable' as const,
    installId: '00000000-0000-4000-8000-000000000001',
    currentVersion: '1.9.15',
    platform: 'win32' as const,
    arch: 'x64',
  };

  it('verifies the signed control and offers the exact versioned Windows installer at the same version', () => {
    const fixtureValue = tauriControlFixture();
    const control = verifyTauriControl(fixtureValue.raw, fixtureValue.signature, fixtureValue.publicKey);
    expect(control).toEqual(fixtureValue.control);
    expect(getTauriMigrationOffer(control, context)).toEqual({
      version: '1.9.15',
      url: `https://github.com/${UPDATE_REPOSITORY}/releases/download/v1.9.15/NatuxWorld-1.9.15-x64-setup.exe`,
    });
  });

  it('keeps migration disabled for old controls and when the signed flag is false', () => {
    const fixtureValue = tauriControlFixture({ migrationEnabled: false });
    const control = verifyTauriControl(fixtureValue.raw, fixtureValue.signature, fixtureValue.publicKey);
    expect(getTauriMigrationOffer(control, context)).toBeNull();

    const oldControl = { ...fixtureValue.control } as Record<string, unknown>;
    delete oldControl.migrationEnabled;
    const oldRaw = JSON.stringify(oldControl);
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const oldSignature = sign(null, Buffer.from(oldRaw), privateKey).toString('base64');
    const parsed = verifyTauriControl(oldRaw, oldSignature, publicKey.export({ type: 'spki', format: 'pem' }).toString());
    expect(parsed.migrationEnabled).toBe(false);
    expect(getTauriMigrationOffer(parsed, context)).toBeNull();
  });

  it('rejects modified signatures, unsafe feed URLs, and unrecognized fields', () => {
    const value = tauriControlFixture();
    expect(() => verifyTauriControl(value.raw.replace('1.9.15', '1.9.16'), value.signature, value.publicKey))
      .toThrow('signature verification failed');

    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const signRaw = (control: Record<string, unknown>) => {
      const raw = JSON.stringify(control);
      return { raw, signature: sign(null, Buffer.from(raw), privateKey).toString('base64') };
    };
    const unsafeFeed = signRaw({ ...value.control, feedUrl: 'https://attacker.invalid/latest.json' });
    expect(() => verifyTauriControl(unsafeFeed.raw, unsafeFeed.signature, publicKey.export({ type: 'spki', format: 'pem' }).toString()))
      .toThrow('feed URL');
    const extraField = signRaw({ ...value.control, installerUrl: 'https://attacker.invalid/app.exe' });
    expect(() => verifyTauriControl(extraField.raw, extraField.signature, publicKey.export({ type: 'spki', format: 'pem' }).toString()))
      .toThrow('Unknown Tauri control field');
  });

  it('applies channel, rollout, platform, and semantic version gates', () => {
    const control = tauriControlFixture().control;
    expect(getTauriMigrationOffer({ ...control, channel: 'beta' }, context)).toBeNull();
    expect(getTauriMigrationOffer({ ...control, rolloutPct: 0 }, context)).toBeNull();
    expect(getTauriMigrationOffer({ ...control, rolloutPct: 25 }, { ...context, installId: 'legacy-内容' })).toBeNull();
    expect(getTauriMigrationOffer({ ...control, version: '1.9.14' }, context)).toBeNull();
    expect(getTauriMigrationOffer(control, { ...context, platform: 'linux' })).toBeNull();
    expect(getTauriMigrationOffer(control, { ...context, platform: 'darwin', arch: 'arm64' })).toEqual({
      version: control.version,
      url: `https://github.com/${UPDATE_REPOSITORY}/releases/download/v1.9.15/NatuxWorld-1.9.15-aarch64.dmg`,
    });
    expect(getTauriMigrationOffer(control, {
      ...context,
      currentVersion: '1.9.16-beta.2',
    })).toBeNull();
    expect(getTauriMigrationOffer({ ...control, version: '1.9.16' }, {
      ...context,
      currentVersion: '1.9.16-beta.2',
    })?.version).toBe('1.9.16');
  });

  it('uses the same rollout bucket as Tauri without transmitting the install id', () => {
    const control = tauriControlFixture({
      version: '1.9.16',
      feedUrl: `https://github.com/${UPDATE_REPOSITORY}/releases/download/v1.9.16/latest.json`,
      rolloutPct: 25,
    }).control;
    const knownRustVector = {
      ...context,
      currentVersion: '1.9.15',
      installId: '00000000-0000-4000-8000-000000000001',
    };
    expect(getTauriMigrationOffer(control, knownRustVector)?.version).toBe('1.9.16');
    expect(getTauriMigrationOffer({ ...control, rolloutPct: 15 }, knownRustVector)).toBeNull();
  });
});
