import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { generateTauriFeed } from '../../scripts/generate-tauri-feed.mjs';

const REPOSITORY = 'Alex-dev-sys/NatuxWorld';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

async function makeDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'natux-tauri-feed-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function addBundle(directory, name, signature = `test-signature:${name}`) {
  await writeFile(path.join(directory, name), 'fixture updater archive');
  if (signature !== null) await writeFile(path.join(directory, `${name}.sig`), `${signature}\n`);
}

function options(directory, overrides = {}) {
  return {
    directory,
    version: '1.9.15',
    channel: 'stable',
    rolloutPct: '100',
    releaseTag: 'v1.9.15',
    privateKeyPem,
    migrationEnabled: false,
    now: new Date('2026-10-11T10:20:30.000Z'),
    ...overrides,
  };
}

test('generates a standard feed for every discovered platform and signs control metadata', async (t) => {
  const directory = await makeDirectory(t);
  await addBundle(directory, 'NATUX WORLD_1.9.15_x64-setup.exe', 'windows-signature');
  await addBundle(directory, 'NATUX WORLD_1.9.15_x86_64-apple-darwin.app.tar.gz', 'intel-signature');
  await addBundle(directory, 'NATUX WORLD_1.9.15_aarch64-apple-darwin.app.tar.gz', 'arm-signature');

  const result = await generateTauriFeed(options(directory, {
    channel: 'beta', rolloutPct: '25', migrationEnabled: true,
  }));
  const rawFeed = await readFile(path.join(directory, 'latest.json'), 'utf8');
  const rawControl = await readFile(path.join(directory, 'natux-tauri-control.json'), 'utf8');
  const rawSignature = await readFile(path.join(directory, 'natux-tauri-control.json.sig'), 'utf8');
  const feed = JSON.parse(rawFeed);
  const control = JSON.parse(rawControl);

  assert.equal(feed.version, '1.9.15');
  assert.equal(feed.pub_date, '2026-10-11T10:20:30.000Z');
  assert.deepEqual(Object.keys(feed.platforms).sort(), [
    'darwin-aarch64',
    'darwin-x86_64',
    'windows-x86_64',
  ]);
  assert.equal(
    feed.platforms['windows-x86_64'].url,
    `https://github.com/${REPOSITORY}/releases/download/v1.9.15/NATUX%20WORLD_1.9.15_x64-setup.exe`,
  );
  assert.equal(feed.platforms['windows-x86_64'].signature, 'windows-signature');
  assert.equal(feed.platforms['darwin-x86_64'].signature, 'intel-signature');
  assert.equal(feed.platforms['darwin-aarch64'].signature, 'arm-signature');
  assert.deepEqual(control, {
    schemaVersion: 1,
    repository: REPOSITORY,
    channel: 'beta',
    version: '1.9.15',
    rolloutPct: 25,
    feedUrl: `https://github.com/${REPOSITORY}/releases/download/v1.9.15/latest.json`,
    migrationEnabled: true,
  });
  assert.equal(rawControl, JSON.stringify(control));
  assert.equal(result.signature, rawSignature);
  assert.equal(verify(null, Buffer.from(rawControl), publicKey, Buffer.from(rawSignature, 'base64')), true);
  assert.doesNotMatch(rawFeed + rawControl, /installId/i);
  assert.deepEqual(JSON.parse(rawFeed), result.latest);

  await generateTauriFeed(options(directory, {
    channel: 'beta', rolloutPct: '25', migrationEnabled: true,
  }));
  assert.equal(await readFile(path.join(directory, 'latest.json'), 'utf8'), rawFeed);
  assert.equal(await readFile(path.join(directory, 'natux-tauri-control.json'), 'utf8'), rawControl);
  assert.equal(await readFile(path.join(directory, 'natux-tauri-control.json.sig'), 'utf8'), rawSignature);
});

test('accepts an MSI updater artifact and URL-encodes asset filenames', async (t) => {
  const directory = await makeDirectory(t);
  const name = 'Natux World_1.9.15_x64.msi';
  await addBundle(directory, name);
  const { latest } = await generateTauriFeed(options(directory));
  assert.equal(latest.platforms['windows-x86_64'].url.endsWith('Natux%20World_1.9.15_x64.msi'), true);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'natux-tauri-control.json'), 'utf8')).migrationEnabled, false);
});

test('rejects invalid release metadata and keys before writing output', async (t) => {
  const directory = await makeDirectory(t);
  const invalidCases = [
    [{ channel: 'preview' }, /CHANNEL/],
    [{ rolloutPct: '101' }, /ROLLOUT_PCT/],
    [{ rolloutPct: '-1' }, /ROLLOUT_PCT/],
    [{ rolloutPct: '2.5' }, /ROLLOUT_PCT/],
    [{ migrationEnabled: 'true' }, /TAURI_MIGRATION_ENABLED/],
    [{ version: '1.9' }, /VERSION/],
    [{ version: '2.0.0', releaseTag: 'v2.0.0' }, /match package.json and src\/native\/tauri.conf.json/],
    [{ releaseTag: 'v1.9.14' }, /RELEASE_TAG/],
    [{ privateKeyPem: 'not a PEM' }, /Ed25519 private key/],
  ];
  const rsaKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    .export({ format: 'pem', type: 'pkcs8' }).toString();
  invalidCases.push([{ privateKeyPem: rsaKey }, /Ed25519 private key/]);

  for (const [overrides, expected] of invalidCases) {
    await assert.rejects(generateTauriFeed(options(directory, overrides)), expected);
  }
  await assert.rejects(readFile(path.join(directory, 'latest.json')), { code: 'ENOENT' });
});

test('rejects missing signatures, unsupported macOS names, and duplicate platform bundles', async (t) => {
  const missing = await makeDirectory(t);
  await addBundle(missing, 'Natux_1.9.15_x64-setup.exe', null);
  await assert.rejects(generateTauriFeed(options(missing)), /Missing signature sidecar/);

  const unidentifiedMac = await makeDirectory(t);
  await addBundle(unidentifiedMac, 'Natux World.app.tar.gz');
  await assert.rejects(generateTauriFeed(options(unidentifiedMac)), /must identify x86_64 or aarch64/);

  const duplicate = await makeDirectory(t);
  await addBundle(duplicate, 'Natux_1.9.15_x64-setup.exe');
  await addBundle(duplicate, 'Natux_1.9.15_x64.msi');
  await assert.rejects(generateTauriFeed(options(duplicate)), /More than one updater archive/);
});

test('rejects an empty bundle directory and non-directory paths', async (t) => {
  const directory = await makeDirectory(t);
  await assert.rejects(generateTauriFeed(options(directory)), /No supported Tauri updater archives/);
  await addBundle(directory, 'Natux_1.9.15_x64-setup.nsis.zip');
  await assert.rejects(generateTauriFeed(options(directory)), /No supported Tauri updater archives/);
  const filePath = path.join(directory, 'regular-file');
  await writeFile(filePath, 'fixture');
  await assert.rejects(generateTauriFeed(options(filePath)), /existing directory/);
});
