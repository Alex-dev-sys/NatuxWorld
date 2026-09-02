import { createHash, createPrivateKey, sign } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repository = 'Alex-dev-sys/NatuxWorld';
const releaseDir = path.resolve('release');
const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid package version: ${version}`);
}

const privateKeyPem = process.env.UPDATE_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!privateKeyPem) throw new Error('UPDATE_SIGNING_PRIVATE_KEY is required');
const privateKey = createPrivateKey(privateKeyPem);
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Update signing key must be Ed25519');

// electron-builder owns the published filename (including its sanitisation of
// product names), so the signed record must be derived from its latest.yml.
// This prevents a harmless-looking filename difference from blocking a valid
// update, while still binding the exact file and SHA-512 in the signature.
const latestYml = await readFile(path.join(releaseDir, 'latest.yml'), 'utf8');
const latestVersion = latestYml.match(/^version:\s*(\S+)\s*$/m)?.[1];
const artifact = latestYml.match(/^\s*-\s+url:\s*(\S+)\s*$/m)?.[1];
const updaterSha512 = latestYml.match(/^\s+sha512:\s*([A-Za-z0-9+/]+={0,2})\s*$/m)?.[1];
if (latestVersion !== version || !artifact || !/^[^/\\]+\.exe$/i.test(artifact) || !updaterSha512) {
  throw new Error('latest.yml does not contain a valid Windows update entry');
}

const files = await readdir(releaseDir);
// electron-builder may sanitize the asset name when uploading it, while keeping
// the local installer name intact. Find the local source by the updater's
// authoritative SHA-512 instead of assuming both filenames are identical.
const matchingArtifacts = [];
for (const file of files.filter((name) => name.toLowerCase().endsWith('.exe'))) {
  const bytes = await readFile(path.join(releaseDir, file));
  if (createHash('sha512').update(bytes).digest('base64') === updaterSha512) {
    matchingArtifacts.push(file);
  }
}
if (matchingArtifacts.length !== 1) {
  throw new Error('Could not identify exactly one local installer matching latest.yml SHA-512');
}
const actualSha512 = updaterSha512;
// Optional release controls: CHANNEL=beta marks a prerelease feed entry,
// ROLLOUT_PCT=25 stages the release to ~25% of installs (stable bucketing).
const manifest = {
  schemaVersion: 1,
  repository,
  version,
  artifact,
  sha512: actualSha512,
  ...(process.env.CHANNEL === 'beta' ? { channel: 'beta' } : {}),
  ...(process.env.ROLLOUT_PCT ? { rolloutPct: Number(process.env.ROLLOUT_PCT) } : {}),
};
const rawManifest = JSON.stringify(manifest);
const signature = sign(null, Buffer.from(rawManifest, 'utf8'), privateKey).toString('base64');

await writeFile(path.join(releaseDir, 'natux-update.json'), rawManifest, { encoding: 'utf8', mode: 0o644 });
await writeFile(path.join(releaseDir, 'natux-update.json.sig'), signature, { encoding: 'ascii', mode: 0o644 });
